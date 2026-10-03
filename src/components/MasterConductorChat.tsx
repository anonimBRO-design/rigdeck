import React, { useState, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRigStore } from "../store/useRigStore";
import {
  ConductorMessage,
  ChatTurn,
  RouterModel,
  DEFAULT_CONDUCTOR_MODEL,
  sendConductorPrompt,
  createConductorTaskJson,
  fetchRouterModels,
  groupModels,
} from "../services/conductorAi";
import {
  MemoryStatus,
  readMemoryContext,
  appendMemory,
  getMemoryStatus,
} from "../services/sharedMemory";
import {
  Send,
  Bot,
  User,
  Cpu,
  Layers,
  Code2,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Trash2,
  Brain,
  RefreshCw,
} from "lucide-react";

const INITIAL_MESSAGES: ConductorMessage[] = [
  {
    id: "msg-1",
    sender: "conductor",
    text: "Halo Afgan! Saya **Master AI Conductor** yang ditenagai oleh **9Router**. Berikan tujuan software atau fitur yang ingin kamu bangun — saya akan membaca shared memory (rig-memory/), memecah misinya, lalu mendelegasikan ke Claude Desktop, Antigravity, dan ChatGPT Desktop.",
    timestamp: "--:--",
  },
];

const MODEL_STORAGE_KEY = "rigdeck.conductorModel";

export const MasterConductorChat: React.FC = () => {
  const { dispatchMissionDelegations, telemetry } = useRigStore();
  const [messages, setMessages] = useState<ConductorMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState<string>("");
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [thinkingStep, setThinkingStep] = useState<string>("Analyzing objective...");

  // Model picker (daftar diambil live dari 9Router /v1/models)
  const [models, setModels] = useState<RouterModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_CONDUCTOR_MODEL
  );

  // Shared memory status
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const loadModels = async () => {
    try {
      setModelsError(null);
      setModels(await fetchRouterModels());
    } catch (err) {
      setModelsError(String(err));
    }
  };

  useEffect(() => {
    loadModels();
    getMemoryStatus().then(setMemoryStatus);
  }, []);

  const handleModelChange = (id: string) => {
    setSelectedModel(id);
    localStorage.setItem(MODEL_STORAGE_KEY, id);
  };

  const groupedModels = useMemo(() => groupModels(models), [models]);
  const modelKnown = models.length === 0 || models.some((m) => m.id === selectedModel);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isThinking) return;

    const userMsg: ConductorMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Riwayat percakapan sebelumnya (tanpa pesan sambutan) untuk konteks multi-turn
    const history: ChatTurn[] = messages
      .filter((m) => m.id !== "msg-1")
      .map((m) => ({ role: m.sender === "user" ? "user" : "assistant", content: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsThinking(true);
    setThinkingStep("Membaca shared memory (rig-memory/)...");

    try {
      const memoryContext = await readMemoryContext();
      setThinkingStep(`Mengirim ke 9Router • ${selectedModel}...`);

      const response = await sendConductorPrompt(text, selectedModel, { memoryContext, history });
      const isError = response.replyText.startsWith("[Error dari 9Router]");
      const delegations = isError ? undefined : response.delegations;

      const conductorMsg: ConductorMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "conductor",
        text: response.replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        delegations,
      };

      setMessages((prev) => [...prev, conductorMsg]);
      if (isError) return;

      // Catat misi ke shared memory supaya Claude, Antigravity & ChatGPT tahu konteksnya
      const memoryLines = [`Misi dari Afgan: "${text}" (model: ${selectedModel})`];
      if (delegations?.claudeTask) memoryLines.push(`→ claude: ${delegations.claudeTask}`);
      if (delegations?.antigravityTask) memoryLines.push(`→ antigravity: ${delegations.antigravityTask}`);
      if (delegations?.chatgptTask) memoryLines.push(`→ chatgpt: ${delegations.chatgptTask}`);
      await appendMemory("conductor", "mission", memoryLines.join("\n"));
      getMemoryStatus().then(setMemoryStatus);

      if (delegations) {
        dispatchMissionDelegations(delegations);

        // Automatically synchronize mission to .rig/context/current_task.json
        try {
          const taskPayload = createConductorTaskJson(
            text,
            delegations.claudeTask || "Design architecture and system contracts",
            delegations.antigravityTask,
            delegations.chatgptTask
          );
          await invoke("write_pointer_task_file", {
            taskPayloadJson: JSON.stringify(taskPayload, null, 2),
          });
        } catch (err) {
          console.warn("Could not write pointer task file:", err);
        }
      }
    } catch (err) {
      console.error("Conductor error:", err);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#141414] border-r border-[#242424] w-[420px] shrink-0 select-none overflow-hidden">
      {/* Header Conductor */}
      <div className="p-3 border-b border-[#242424] bg-[#181818] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded bg-[#222222] border border-[#303030] flex items-center justify-center text-[#007acc]">
            <Bot size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-white tracking-wide">
                Master Conductor
              </h2>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#202020] text-[#888888] border border-[#2e2e2e]">
                9Router
              </span>
            </div>
            <p className="text-[10px] text-[#777777] font-mono flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] inline-block" />
              <span>3 Desktop GUIs</span>
              <span className="text-[#444444]">•</span>
              <span className="text-[#888888]">{telemetry.latencyMs}ms</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => setMessages(INITIAL_MESSAGES)}
          title="Reset Conductor Chat"
          className="p-1.5 rounded text-[#777777] hover:text-[#cccccc] hover:bg-[#222222] transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Model Picker + Shared Memory badge */}
      <div className="px-3 py-1.5 border-b border-[#242424] bg-[#161616] flex items-center gap-2">
        <Cpu size={13} className="text-[#777777] shrink-0" />
        <select
          value={selectedModel}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={isThinking}
          title="Pilih model untuk Master Conductor (dari 9Router)"
          className="flex-1 min-w-0 bg-[#1e1e1e] border border-[#2e2e2e] hover:border-[#3e3e3e] focus:border-[#007acc] rounded px-2 py-1 text-[11px] font-mono text-[#cccccc] outline-none cursor-pointer disabled:opacity-50"
        >
          {!modelKnown && <option value={selectedModel}>{selectedModel} (tidak tersedia)</option>}
          {models.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
          {Object.entries(groupedModels).map(([group, list]) => (
            <optgroup key={group} label={`${group} (${list.length})`}>
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {m.contextWindow ? ` · ${Math.round(m.contextWindow / 1000)}k` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={loadModels}
          title={modelsError ? `Gagal memuat model: ${modelsError}` : "Muat ulang daftar model"}
          className={`p-1 rounded hover:bg-[#222222] transition-colors ${
            modelsError ? "text-rose-400" : "text-[#777777] hover:text-[#cccccc]"
          }`}
        >
          <RefreshCw size={12} />
        </button>
        <span
          title={memoryStatus ? `Vault: ${memoryStatus.vault_path}` : "Shared memory belum aktif"}
          className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
            memoryStatus
              ? "bg-[#1f1f1f] text-[#a0a0a0] border-[#2e2e2e]"
              : "bg-[#181818] text-[#555555] border-[#242424]"
          }`}
        >
          <Brain size={11} />
          {memoryStatus ? `${memoryStatus.note_count} notes` : "off"}
        </span>
      </div>

      {/* Chat Messages Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[#666666] font-mono px-1">
                {isUser ? (
                  <>
                    <span>Afgan</span>
                    <User size={10} className="text-[#888888]" />
                  </>
                ) : (
                  <>
                    <Bot size={10} className="text-[#007acc]" />
                    <span className="text-[#a0a0a0] font-medium">Master Conductor</span>
                    <span>• {msg.timestamp}</span>
                  </>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[92%] p-3 rounded-lg text-xs leading-relaxed ${
                  isUser
                    ? "bg-[#222222] text-[#f0f0f0] border border-[#303030]"
                    : "bg-[#181818] text-[#cccccc] border border-[#262626]"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Delegation Matrix Card if present */}
                {msg.delegations && (
                  <div className="mt-3 pt-2.5 border-t border-[#262626] space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#777777]">
                      <span className="uppercase tracking-wider font-medium text-[#aaaaaa] flex items-center gap-1">
                        Dispatched to 3 Desktop GUIs:
                      </span>
                      <span className="text-[#10b981] flex items-center gap-1">
                        <CheckCircle2 size={10} /> Active
                      </span>
                    </div>

                    {/* 🟠 Claude Delegation */}
                    {msg.delegations.claudeTask && (
                      <div className="p-2 rounded bg-[#1a1714] border border-[#2e261e] flex items-start gap-2">
                        <div className="p-1 rounded bg-[#261f18] text-[#d97706] mt-0.5 shrink-0">
                          <Layers size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-semibold text-[#d97706] block">
                            Claude Desktop (The Architect)
                          </span>
                          <p className="text-[11px] text-[#b0b0b0] line-clamp-2 mt-0.5">
                            {msg.delegations.claudeTask}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 🔵 Antigravity Delegation */}
                    {msg.delegations.antigravityTask && (
                      <div className="p-2 rounded bg-[#141920] border border-[#1e2734] flex items-start gap-2">
                        <div className="p-1 rounded bg-[#1a2330] text-[#007acc] mt-0.5 shrink-0">
                          <Code2 size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-semibold text-[#007acc] block">
                            Antigravity IDE (The Coder & OS)
                          </span>
                          <p className="text-[11px] text-[#b0b0b0] line-clamp-2 mt-0.5">
                            {msg.delegations.antigravityTask}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ⚪ ChatGPT Delegation */}
                    {msg.delegations.chatgptTask && (
                      <div className="p-2 rounded bg-[#141c18] border border-[#1e2c24] flex items-start gap-2">
                        <div className="p-1 rounded bg-[#182620] text-[#10b981] mt-0.5 shrink-0">
                          <ShieldCheck size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-semibold text-[#10b981] block">
                            ChatGPT Desktop (The Reviewer)
                          </span>
                          <p className="text-[11px] text-[#b0b0b0] line-clamp-2 mt-0.5">
                            {msg.delegations.chatgptTask}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Thinking & Decomposing Mission Animation */}
        {isThinking && (
          <div className="flex flex-col items-start space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-[#777777] font-mono px-1">
              <Bot size={11} />
              <span>Master Conductor</span>
            </div>
            <div className="p-3 rounded-lg bg-[#181818] border border-[#2a2a2a] text-xs text-[#a0a0a0] space-y-2 max-w-[90%]">
              <div className="flex items-center gap-2 text-[#cccccc] font-medium font-mono text-[11px]">
                <Loader2 size={12} className="animate-spin text-[#007acc]" />
                <span>Memproses misi...</span>
              </div>
              <p className="text-[11px] text-[#777777] font-mono">
                {thinkingStep}
              </p>
              <div className="h-1 w-full bg-[#242424] rounded-full overflow-hidden">
                <div className="h-full bg-[#007acc] animate-[pulse_1s_infinite] w-2/3 rounded-full" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <div className="p-3 bg-[#181818] border-t border-[#242424]">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ketik tujuan proyek... (Enter untuk kirim)"
            disabled={isThinking}
            className="w-full bg-[#131313] border border-[#282828] rounded-lg px-3 py-2 text-xs text-[#f0f0f0] placeholder:text-[#555555] focus:outline-none focus:border-[#007acc] resize-none pr-10"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isThinking}
            className="absolute right-2 bottom-3 p-1.5 rounded bg-[#007acc] hover:bg-[#0062a3] disabled:opacity-30 text-white transition-colors"
          >
            <Send size={13} />
          </button>
        </div>

        <div className="flex items-center justify-between mt-2 text-[10px] text-[#555555] font-mono px-1">
          <span className="flex items-center gap-1">
            <Cpu size={10} className="text-[#777777]" />
            <span>9Router :20128</span>
          </span>
          <span>Shift+Enter untuk baris baru</span>
        </div>
      </div>
    </div>
  );
};

export default MasterConductorChat;
