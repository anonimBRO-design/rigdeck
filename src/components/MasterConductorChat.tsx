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
  Sparkles,
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
  Zap,
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

const QUICK_STARTERS = [
  "Bangun JWT Auth dengan Refresh Token Rotation & Cookie Guard",
  "Refactor Multi-PTY stream ke WebGL Native dengan fallback DOM",
  "Audit Keamanan Diff & Sanitasi SQL injection di Blackboard WAL",
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
    <div className="flex flex-col h-full bg-[#0a0e17] border-r border-rig-border w-[440px] shrink-0 select-none overflow-hidden shadow-2xl">
      {/* Header Conductor */}
      <div className="p-3.5 border-b border-rig-border bg-slate-900/90 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Sparkles size={16} className="text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Master AI Conductor
              </h2>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                9Router
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>Orchestrating 3 Desktop GUIs</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400">{telemetry.latencyMs}ms</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => setMessages(INITIAL_MESSAGES)}
          title="Reset Conductor Chat"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Model Picker + Shared Memory badge */}
      <div className="px-3.5 py-2 border-b border-rig-border bg-slate-950/70 flex items-center gap-2">
        <Cpu size={13} className="text-indigo-400 shrink-0" />
        <select
          value={selectedModel}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={isThinking}
          title="Pilih model untuk Master Conductor (dari 9Router)"
          className="flex-1 min-w-0 bg-slate-900 border border-slate-700 hover:border-indigo-500/60 focus:border-indigo-500 rounded-md px-2 py-1 text-[11px] font-mono text-slate-200 outline-none cursor-pointer disabled:opacity-50"
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
          className={`p-1 rounded-md hover:bg-slate-800 transition-colors ${
            modelsError ? "text-rose-400" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <RefreshCw size={12} />
        </button>
        <span
          title={memoryStatus ? `Vault: ${memoryStatus.vault_path}` : "Shared memory belum aktif"}
          className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full border shrink-0 ${
            memoryStatus
              ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
              : "bg-slate-800 text-slate-500 border-slate-700"
          }`}
        >
          <Brain size={11} />
          {memoryStatus ? `${memoryStatus.note_count} notes` : "off"}
        </span>
      </div>

      {/* Chat Messages Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500 font-mono px-1">
                {isUser ? (
                  <>
                    <span>Afgan (Operator)</span>
                    <User size={11} className="text-blue-400" />
                  </>
                ) : (
                  <>
                    <Bot size={11} className="text-indigo-400" />
                    <span className="text-indigo-300 font-semibold">Master Conductor</span>
                    <span>• {msg.timestamp}</span>
                  </>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[92%] p-3.5 rounded-2xl text-xs leading-relaxed transition-all shadow-md ${
                  isUser
                    ? "bg-blue-600/30 text-blue-100 border border-blue-500/40 rounded-tr-sm"
                    : "bg-slate-900/90 text-slate-200 border border-slate-800 rounded-tl-sm backdrop-blur-md"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Delegation Matrix Card if present */}
                {msg.delegations && (
                  <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="uppercase tracking-wider font-semibold text-cyan-400 flex items-center gap-1">
                        <Zap size={11} />
                        Dispatched to 3 Desktop GUIs:
                      </span>
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Active Sync
                      </span>
                    </div>

                    {/* 🟠 Claude Delegation */}
                    {msg.delegations.claudeTask && (
                      <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-start gap-2">
                        <div className="p-1 rounded bg-amber-500/20 text-amber-400 mt-0.5 shrink-0">
                          <Layers size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-amber-300 block">
                            Claude Desktop (The Architect)
                          </span>
                          <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5">
                            {msg.delegations.claudeTask}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 🔵 Antigravity Delegation */}
                    {msg.delegations.antigravityTask && (
                      <div className="p-2 rounded-lg bg-cyan-950/20 border border-cyan-500/30 flex items-start gap-2">
                        <div className="p-1 rounded bg-cyan-500/20 text-cyan-400 mt-0.5 shrink-0">
                          <Code2 size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-cyan-300 block">
                            Antigravity IDE (The Coder & OS)
                          </span>
                          <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5">
                            {msg.delegations.antigravityTask}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ⚪ ChatGPT Delegation */}
                    {msg.delegations.chatgptTask && (
                      <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-2">
                        <div className="p-1 rounded bg-emerald-500/20 text-emerald-400 mt-0.5 shrink-0">
                          <ShieldCheck size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-emerald-300 block">
                            ChatGPT Desktop (The Reviewer)
                          </span>
                          <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5">
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
          <div className="flex flex-col items-start space-y-1 animate-fadeIn">
            <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-mono px-1">
              <Bot size={11} />
              <span>Master Conductor (9Router)</span>
            </div>
            <div className="p-3.5 rounded-2xl rounded-tl-sm bg-slate-900/90 border border-blue-500/40 text-xs text-slate-300 shadow-xl shadow-blue-500/10 space-y-2 max-w-[90%]">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold font-mono text-[11px]">
                <Loader2 size={13} className="animate-spin text-blue-400" />
                <span>Thinking & Decomposing Mission...</span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono animate-pulse">
                {thinkingStep}
              </p>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-[pulse_1s_infinite] w-3/4 rounded-full" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Mission Starter Chips */}
      <div className="px-3 py-2 bg-slate-950/60 border-t border-rig-border/50">
        <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500 block mb-1">
          Quick Mission Presets:
        </span>
        <div className="flex flex-col gap-1">
          {QUICK_STARTERS.map((starter) => (
            <button
              key={starter}
              onClick={() => handleSend(starter)}
              disabled={isThinking}
              className="text-[10px] text-left text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 px-2 py-1 rounded transition-colors truncate border border-transparent hover:border-slate-700/60"
            >
              + {starter}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Input Bar */}
      <div className="p-3 bg-slate-900/90 border-t border-rig-border backdrop-blur-md">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ketik tujuan besar proyek... (Enter untuk kirim)"
            disabled={isThinking}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none pr-10"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isThinking}
            className="absolute right-2.5 bottom-3.5 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-all shadow-md shadow-blue-500/20"
          >
            <Send size={13} />
          </button>
        </div>

        <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500 font-mono px-1">
          <span className="flex items-center gap-1">
            <Cpu size={10} className="text-blue-400" />
            <span>9Router :20128 Pool Active</span>
          </span>
          <span>Shift+Enter untuk baris baru</span>
        </div>
      </div>
    </div>
  );
};

export default MasterConductorChat;
