import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRigStore } from "../store/useRigStore";
import { ChatMessage, Conversation, SearchHit } from "../types";
import {
  ChatTurn,
  RouterModel,
  DEFAULT_CONDUCTOR_MODEL,
  sendConductorPrompt,
  createConductorTaskJson,
  fetchRouterModels,
} from "../services/conductorAi";
import {
  MemoryStatus,
  readMemoryContext,
  appendMemory,
  getMemoryStatus,
} from "../services/sharedMemory";
import {
  createConversation,
  getConversationMessages,
  saveMessage,
  deleteConversation,
  renameConversation,
  autoTitleFromPrompt,
  isDefaultTitle,
  parseDelegations,
  createDagTasksFromDelegations,
  DEFAULT_CONVERSATION_TITLE,
} from "../services/conversations";
import {
  searchMessages,
  exportConversationHandoff,
  pollMissionResult,
  missionStatusMeta,
  type TaskResult,
} from "../services/mission";
import { ModelPickerModal, ModelSelectorTrigger } from "./ModelPickerModal";
import { quotaRadar } from "../services/quotaRadar";
import { MISSION_BLUEPRINTS } from "../services/blueprints";
import { soundFx } from "../services/soundFx";
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
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  MessageSquare,
  Pencil,
  Check,
  X,
  Search,
  FileDown,
  RadioTower,
  Paperclip,
  Sparkles,
  FileUp,
} from "lucide-react";

interface ContextAttachment {
  id: string;
  name: string;
  size: number;
  content: string;
}

const MODEL_STORAGE_KEY = "rigdeck.conductorModel";
const SIDEBAR_STORAGE_KEY = "rigdeck.chatSidebarOpen";

const WELCOME_TEXT =
  "Halo Afgan! Saya **Valence** (Master AI Conductor) yang ditenagai oleh **9Router**. Berikan tujuan software atau fitur yang ingin kamu bangun — saya akan membaca shared memory (rig-memory/), memecah misinya, lalu mendelegasikan ke Mas Claude, Mbak Agy, dan Bg Codex.";

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diffMin = Math.floor((Date.now() - d) / 60000);
  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}j`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}h`;
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });
}

/** Pecah snippet FTS5 (penanda `<<` `>>`) menjadi elemen React yang aman. */
function renderSnippet(snippet: string): React.ReactNode[] {
  const parts = snippet.split(/(<<|>>)/);
  const nodes: React.ReactNode[] = [];
  let highlight = false;
  parts.forEach((part, i) => {
    if (part === "<<") {
      highlight = true;
      return;
    }
    if (part === ">>") {
      highlight = false;
      return;
    }
    if (!part) return;
    nodes.push(
      highlight ? (
        <mark
          key={i}
          className="bg-[#007acc]/30 text-[#e8e8e8] rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  });
  return nodes;
}

export const MasterConductorChat: React.FC = () => {
  const {
    dispatchMissionDelegations,
    telemetry,
    activeProject,
    conversations,
    loadConversations,
    activeConversationId,
    setActiveConversationId,
    recordTokens,
    ecoMode,
    pendingBlueprintPrompt,
    setPendingBlueprintPrompt,
  } = useRigStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [thinkingStep, setThinkingStep] = useState<string>("Analyzing objective...");
  const [loadingThread, setLoadingThread] = useState<boolean>(false);
  /** Teks balasan yang sedang di-stream (null bila tidak ada stream aktif). */
  const [streamingText, setStreamingText] = useState<string | null>(null);

  // Context Dropzone Attachments
  const [attachments, setAttachments] = useState<ContextAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [blueprintModalOpen, setBlueprintModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Thread sidebar
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false"
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");

  // Pencarian lintas thread (FTS5)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  // Hasil misi terakhir yang masuk dari agen (penutup loop delegasi)
  const [missionResult, setMissionResult] = useState<TaskResult | null>(null);
  const [missionToast, setMissionToast] = useState<string | null>(null);

  // Export handoff
  const [exporting, setExporting] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  // Model picker (daftar diambil live dari 9Router /v1/models)
  const [models, setModels] = useState<RouterModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_CONDUCTOR_MODEL
  );
  const [modelPickerOpen, setModelPickerOpen] = useState<boolean>(false);
  const [isRefreshingModels, setIsRefreshingModels] = useState<boolean>(false);

  // Shared memory status
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Thread yang baru dibuat lokal — jangan load dari DB agar pesan baru tidak tertimpa. */
  const skipLoadRef = useRef<Set<string>>(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  // Tangkap preset prompt dari Command Palette
  useEffect(() => {
    if (pendingBlueprintPrompt) {
      setInputValue(pendingBlueprintPrompt);
      setPendingBlueprintPrompt(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [pendingBlueprintPrompt, setPendingBlueprintPrompt]);

  // Context Dropzone helper
  const handleProcessFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const loaded: ContextAttachment[] = [];
    for (const f of files) {
      if (f.size > 2 * 1024 * 1024) {
        alert(`File ${f.name} terlalu besar (maksimum 2MB)`);
        continue;
      }
      try {
        const content = await f.text();
        loaded.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: f.name,
          size: f.size,
          content,
        });
      } catch (err) {
        console.warn("Gagal membaca file:", f.name, err);
      }
    }
    if (loaded.length > 0) {
      setAttachments((prev) => [...prev, ...loaded]);
      soundFx.playRelayStep();
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      await handleProcessFiles(e.dataTransfer.files);
    }
  };

  const loadModels = async () => {
    try {
      setIsRefreshingModels(true);
      setModelsError(null);
      setModels(await fetchRouterModels());
    } catch (err) {
      setModelsError(String(err));
    } finally {
      setIsRefreshingModels(false);
    }
  };

  useEffect(() => {
    loadModels();
    getMemoryStatus().then(setMemoryStatus);
  }, []);

  // Muat daftar thread saat project aktif berubah
  useEffect(() => {
    if (activeProject?.id) loadConversations();
  }, [activeProject?.id, loadConversations]);

  // Muat pesan saat thread aktif berubah (persistent history)
  useEffect(() => {
    let cancelled = false;

    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    // Thread baru dibuat di sesi ini: state lokal sudah benar, hindari race dengan DB kosong.
    if (skipLoadRef.current.has(activeConversationId)) {
      skipLoadRef.current.delete(activeConversationId);
      setLoadingThread(false);
      return;
    }

    setLoadingThread(true);
    getConversationMessages(activeConversationId)
      .then((rows) => {
        if (cancelled) return;
        const restored: ChatMessage[] = rows
          .filter((r) => r.id !== "msg-welcome")
          .map((r) => ({
            id: r.id,
            sender: r.sender === "system" ? "conductor" : r.sender,
            text: r.text,
            timestamp: formatClock(r.created_at),
            createdAt: r.created_at,
            delegations: parseDelegations(r.delegations_json),
            tokensUsed: r.tokens_used,
          }));
        setMessages(restored);
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversationId]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  const handleModelChange = (id: string) => {
    setSelectedModel(id);
    localStorage.setItem(MODEL_STORAGE_KEY, id);
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  /** Buat thread baru; dipakai oleh tombol + New Mission dan saat kirim prompt pertama. */
  const handleNewMission = useCallback(async (): Promise<Conversation | null> => {
    const projectId = activeProject?.id;
    if (!projectId) return null;
    try {
      const conv = await createConversation(projectId, DEFAULT_CONVERSATION_TITLE, selectedModel);
      skipLoadRef.current.add(conv.id);
      await loadConversations();
      setActiveConversationId(conv.id);
      setMessages([]);
      return conv;
    } catch (err) {
      console.warn("Gagal membuat thread baru:", err);
      return null;
    }
  }, [activeProject?.id, selectedModel, loadConversations, setActiveConversationId]);

  const handleDeleteConversation = async (convId: string) => {
    try {
      await deleteConversation(convId);
      await loadConversations();
      if (convId === activeConversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.warn("Gagal menghapus thread:", err);
    }
  };

  // Poll hasil misi dari agen (penutup loop delegasi). Backend men-dedupe,
  // jadi polling berkala tidak akan mencatat event yang sama dua kali.
  useEffect(() => {
    if (!activeProject?.id) {
      setMissionResult(null);
      return;
    }

    let cancelled = false;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    // Hasil misi milik project sebelumnya tidak relevan lagi.
    setMissionResult(null);

    const check = async () => {
      const outcome = await pollMissionResult();
      if (cancelled || !outcome) return;
      if (outcome.task_result) {
        // Hasil terbaru selalu menang, termasuk yang sudah diproses sebelumnya
        // (mis. setelah restart app) — backend tetap men-dedupe audit event-nya.
        setMissionResult(outcome.task_result);
      }
      if (outcome.processed) {
        setMissionToast(outcome.message);
        getMemoryStatus().then(setMemoryStatus);
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setMissionToast(null), 6000);
      }
    };

    check();
    const interval = setInterval(check, 15000);
    return () => {
      cancelled = true;
      if (toastTimer) clearTimeout(toastTimer);
      clearInterval(interval);
    };
  }, [activeProject?.id]);

  // Pencarian lintas thread dengan debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const hits = await searchMessages(q, 30);
      setSearchHits(hits);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, activeProject?.id]);

  const handleJumpToHit = async (hit: SearchHit) => {
    setActiveConversationId(hit.conversation_id);
    setSearchQuery("");
    setSearchHits([]);
  };

  /** Ekspor thread aktif menjadi catatan handoff di rig-memory/handoffs/. */
  const handleExportHandoff = async (conv: Conversation) => {
    if (exporting) return;
    setExporting(true);
    try {
      // Ambil pesan langsung dari DB agar lengkap walau thread tidak sedang dibuka.
      const rows = await getConversationMessages(conv.id);
      const payload = rows
        .filter((r) => r.id !== "msg-welcome")
        .map((r) => ({
          sender: r.sender,
          text: r.text,
          created_at: r.created_at,
          target: null,
        }));

      if (payload.length === 0) {
        setExportToast("Thread ini belum punya pesan untuk diekspor.");
        setTimeout(() => setExportToast(null), 4000);
        return;
      }

      // Target agen diambil dari delegasi yang pernah dikirim di thread ini.
      const targets = new Set<string>();
      for (const r of rows) {
        const d = parseDelegations(r.delegations_json);
        if (d?.claudeTask) targets.add("claude");
        if (d?.antigravityTask) targets.add("antigravity");
        if (d?.chatgptTask) targets.add("chatgpt");
      }

      const rel = await exportConversationHandoff(conv.title, conv.id, payload, [...targets]);
      setExportToast(
        rel ? `Handoff tersimpan di rig-memory/${rel}` : "Gagal mengekspor handoff (cek log)."
      );
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  const handleStartRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  };

  const handleCommitRename = async () => {
    const id = renamingId;
    const title = renameValue.trim();
    setRenamingId(null);
    if (!id || !title) return;
    try {
      await renameConversation(id, title);
      await loadConversations();
    } catch (err) {
      console.warn("Gagal rename thread:", err);
    }
  };

  const handleSend = async (textToSend?: string) => {
    let text = (textToSend || inputValue).trim();
    if ((!text && attachments.length === 0) || isThinking) return;

    if (attachments.length > 0) {
      const fileBlocks = attachments
        .map((att) => {
          const ext = att.name.split(".").pop() || "txt";
          return `### File: ${att.name} (${Math.round((att.size / 1024) * 10) / 10} KB)\n\`\`\`${ext}\n${att.content}\n\`\`\``;
        })
        .join("\n\n");

      text = text
        ? `[ATTACHED CONTEXT FILES]\n${fileBlocks}\n\n---\n[USER PROMPT]\n${text}`
        : `[ATTACHED CONTEXT FILES]\n${fileBlocks}\n\n---\nMohon analisis file context di atas dan delegasikan misinya.`;

      setAttachments([]);
    }

    const projectId = activeProject?.id;
    if (!projectId) {
      console.warn("Tidak ada project aktif — tidak bisa menyimpan percakapan.");
      return;
    }

    // Pastikan selalu ada thread aktif (lazy-create saat prompt pertama)
    let convId = activeConversationId;
    let conv = activeConversation;
    if (!convId || !conv) {
      const created = await handleNewMission();
      if (!created) return;
      convId = created.id;
      conv = created;
    }

    const userCreatedAt = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      sender: "user",
      text,
      timestamp: formatClock(userCreatedAt),
      createdAt: userCreatedAt,
    };

    // Riwayat percakapan sebelumnya (tanpa pesan sambutan) untuk konteks multi-turn
    const history: ChatTurn[] = messages.map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsThinking(true);
    setThinkingStep("Membaca shared memory (rig-memory/)...");

    // Auto-title thread dari prompt pertama bila masih berjudul default
    const shouldAutoTitle = isDefaultTitle(conv?.title ?? "");

    try {
      await saveMessage({
        id: userMsg.id,
        conversationId: convId,
        sender: "user",
        text,
        createdAt: userCreatedAt,
      });

      if (shouldAutoTitle) {
        await renameConversation(convId, autoTitleFromPrompt(text));
        await loadConversations();
      }

      const modelToUse = ecoMode
        ? quotaRadar.resolveEcoModel(selectedModel, models.map((m) => m.id))
        : selectedModel;

      const memoryContext = await readMemoryContext();
      setThinkingStep(`Mengirim ke 9Router • ${modelToUse}...`);

      // Streaming: tampilkan teks yang sedang tumbuh. Blok JSON delegasi
      // disembunyikan selama streaming supaya bubble tetap rapi.
      setStreamingText("");
      const stripPartialJson = (t: string) => t.replace(/```json[\s\S]*$/, "").trimEnd();

      const response = await sendConductorPrompt(text, modelToUse, {
        memoryContext,
        history,
        onChunk: (accumulated) => setStreamingText(stripPartialJson(accumulated)),
      });
      setStreamingText(null);
      const isError = response.replyText.startsWith("[Error dari 9Router]");
      const delegations = isError ? undefined : response.delegations;

      // Track tokens in Quota Radar
      const usedTokens = response.tokensUsed || Math.round((text.length + response.replyText.length) / 3.5);
      recordTokens(usedTokens);

      const conductorCreatedAt = new Date().toISOString();
      const conductorMsg: ChatMessage = {
        id: `msg-${Date.now()}-c`,
        sender: "conductor",
        text: response.replyText,
        timestamp: formatClock(conductorCreatedAt),
        createdAt: conductorCreatedAt,
        delegations,
        tokensUsed: usedTokens,
      };

      setMessages((prev) => [...prev, conductorMsg]);

      await saveMessage({
        id: conductorMsg.id,
        conversationId: convId,
        sender: "conductor",
        text: response.replyText,
        delegations,
        tokensUsed: usedTokens,
        createdAt: conductorCreatedAt,
      });
      await loadConversations();

      if (isError) return;

      // Catat misi ke shared memory supaya Claude, Antigravity & ChatGPT tahu konteksnya
      const memoryLines = [`Misi dari Afgan: "${text}" (model: ${modelToUse})`];
      if (delegations?.claudeTask) memoryLines.push(`→ claude: ${delegations.claudeTask}`);
      if (delegations?.antigravityTask) memoryLines.push(`→ antigravity: ${delegations.antigravityTask}`);
      if (delegations?.chatgptTask) memoryLines.push(`→ chatgpt: ${delegations.chatgptTask}`);
      await appendMemory("conductor", "mission", memoryLines.join("\n"));
      getMemoryStatus().then(setMemoryStatus);

      if (delegations) {
        dispatchMissionDelegations(delegations, text);

        try {
          const taskPayload = createConductorTaskJson(
            text,
            delegations.claudeTask || "Design architecture and system contracts",
            delegations.antigravityTask,
            delegations.chatgptTask,
            {
              projectName: activeProject?.name ?? "RigDeck Project",
              rootPath: activeProject?.path ?? "",
            }
          );
          await invoke("write_pointer_task_file", {
            taskPayloadJson: JSON.stringify(taskPayload, null, 2),
          });
        } catch (err) {
          console.warn("Could not write pointer task file:", err);
        }

        // Isi Task DAG otomatis dari delegasi (root = misi, sisanya sub-task)
        try {
          await createDagTasksFromDelegations(text, delegations);
        } catch (err) {
          console.warn("Gagal membuat DAG task dari delegasi:", err);
        }
      }
    } catch (err) {
      console.error("Conductor error:", err);
    } finally {
      setStreamingText(null);
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const noProject = !activeProject;

  return (
    <div className="flex h-full shrink-0 select-none overflow-hidden">
      {/* ---------------- Thread Sidebar (collapsible) ---------------- */}
      <div
        className={`flex flex-col h-full bg-[#111111] border-r border-[#242424] transition-all duration-200 ${
          sidebarOpen ? "w-[212px]" : "w-0"
        } overflow-hidden`}
      >
        <div className="p-2.5 border-b border-[#242424] flex items-center justify-between shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-[#777777] font-semibold flex items-center gap-1.5">
            <MessageSquare size={11} />
            Missions
          </span>
          <span className="text-[10px] font-mono text-[#555555]">{conversations.length}</span>
        </div>

        {/* Pencarian lintas thread (FTS5) */}
        <div className="px-2 pt-2 shrink-0 relative">
          <Search size={11} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555555] mt-1" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari semua misi…"
            className="w-full bg-[#161616] border border-[#282828] rounded-md pl-7 pr-2 py-1 text-[11px] text-[#e0e0e0] placeholder:text-[#555555] focus:outline-none focus:border-[#007acc]"
          />
        </div>

        <button
          onClick={handleNewMission}
          disabled={noProject}
          title={noProject ? "Buka project terlebih dahulu" : "Mulai misi baru"}
          className="m-2 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-[#007acc] hover:bg-[#0062a3] disabled:opacity-30 text-white text-[11px] font-medium transition-colors shrink-0"
        >
          <Plus size={12} />
          New Mission
        </button>

        <div className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-0.5">
          {/* Hasil pencarian lintas thread */}
          {searchQuery.trim() !== "" && (
            <>
              <div className="px-2 py-1.5 text-[9px] uppercase tracking-wider text-[#666666] font-semibold flex items-center justify-between">
                <span>Hasil Pencarian</span>
                {searching && <Loader2 size={9} className="animate-spin text-[#007acc]" />}
              </div>
              {!searching && searchHits.length === 0 && (
                <p className="px-2 py-2 text-[10px] text-[#555555]">
                  Tidak ada pesan yang cocok dengan “{searchQuery.trim()}”.
                </p>
              )}
              {searchHits.map((hit) => (
                <button
                  key={hit.message_id}
                  onClick={() => handleJumpToHit(hit)}
                  title={`Buka thread: ${hit.conversation_title}`}
                  className="w-full text-left rounded-md px-2 py-1.5 border border-transparent hover:bg-[#191919] hover:border-[#2a2a2a] transition-colors"
                >
                  <div className="text-[10px] text-[#007acc] font-medium truncate">
                    {hit.conversation_title}
                  </div>
                  {/* Snippet FTS5 memakai << >> sebagai penanda match — dirender sebagai
                      elemen React (bukan HTML mentah) supaya tidak ada risiko XSS. */}
                  <div className="text-[10px] text-[#999999] line-clamp-2 mt-0.5">
                    {renderSnippet(hit.snippet)}
                  </div>
                  <div className="text-[9px] font-mono text-[#555555] mt-0.5">
                    {hit.sender} · {formatRelative(hit.created_at)}
                  </div>
                </button>
              ))}
              {searchHits.length > 0 && (
                <div className="px-2 pt-2 text-[9px] font-mono text-[#555555]">
                  {searchHits.length} pesan ditemukan
                </div>
              )}
            </>
          )}

          {searchQuery.trim() === "" && conversations.length === 0 && (
            <p className="px-2 py-3 text-[10px] text-[#555555] leading-relaxed">
              Belum ada misi. Kirim prompt untuk memulai thread pertama — judul dibuat otomatis.
            </p>
          )}

          {searchQuery.trim() === "" && conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isRenaming = renamingId === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => !isRenaming && setActiveConversationId(conv.id)}
                className={`group relative rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                  isActive ? "bg-[#1e1e1e] border border-[#2e2e2e]" : "border border-transparent hover:bg-[#191919]"
                }`}
              >
                {isRenaming ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 min-w-0 bg-[#131313] border border-[#007acc] rounded px-1.5 py-0.5 text-[11px] text-[#f0f0f0] outline-none"
                    />
                    <button onClick={handleCommitRename} className="p-0.5 text-[#10b981] hover:text-[#34d399]">
                      <Check size={11} />
                    </button>
                    <button onClick={() => setRenamingId(null)} className="p-0.5 text-[#777777] hover:text-[#cccccc]">
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] truncate pr-10 text-[#d0d0d0] font-medium">
                      {conv.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] font-mono px-1 rounded bg-[#1f1f1f] text-[#888888] border border-[#2a2a2a] truncate max-w-[92px]">
                        {conv.model.split("/").pop()}
                      </span>
                      <span className="text-[9px] font-mono text-[#555555]">
                        {formatRelative(conv.updated_at)}
                      </span>
                    </div>

                    {/* Hover actions: rename & delete */}
                    <div className="absolute right-1 top-1.5 hidden group-hover:flex items-center gap-0.5 bg-[#1e1e1e] rounded px-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(conv);
                        }}
                        title="Rename thread"
                        className="p-0.5 text-[#777777] hover:text-[#cccccc]"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportHandoff(conv);
                        }}
                        disabled={exporting}
                        title="Ekspor thread ini ke rig-memory/handoffs/ (untuk diserahkan ke AI lain)"
                        className="p-0.5 text-[#777777] hover:text-[#007acc] disabled:opacity-40"
                      >
                        <FileDown size={10} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                        title="Hapus thread"
                        className="p-0.5 text-[#777777] hover:text-[#ef4444]"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- Main Chat Column ---------------- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
        className="flex flex-col h-full bg-[#141414] border-r border-[#242424] w-[420px] shrink-0 overflow-hidden relative"
      >
        {/* Dropzone Glow Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-[#007acc]/20 border-2 border-dashed border-[#007acc] rounded-lg backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center pointer-events-none animate-in fade-in duration-100">
            <FileUp size={36} className="text-[#007acc] mb-2 animate-bounce" />
            <p className="text-xs font-semibold text-white">Drop file di sini untuk melampirkan ke Valence</p>
            <p className="text-[10px] text-[#888888] font-mono mt-1">Kode, dokumen, atau log otomatis dimasukkan sebagai context</p>
          </div>
        )}
        {/* Header Conductor */}
        <div className="p-3 border-b border-[#242424] bg-[#181818] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleSidebar}
              title={sidebarOpen ? "Sembunyikan daftar misi" : "Tampilkan daftar misi"}
              className="p-1 rounded text-[#777777] hover:text-[#cccccc] hover:bg-[#222222] transition-colors"
            >
              {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
            <div className="h-7 w-7 rounded bg-[#222222] border border-[#303030] flex items-center justify-center text-[#007acc]">
              <Bot size={15} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-white tracking-wide">
                  Valence <span className="text-[#888888] font-normal text-[11px]">(Conductor)</span>
                </h2>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#202020] text-[#888888] border border-[#2e2e2e]">
                  9Router
                </span>
              </div>
              <p className="text-[10px] text-[#777777] font-mono flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] inline-block" />
                <span className="truncate max-w-[150px]" title={activeConversation?.title}>
                  {activeConversation?.title ?? "Belum ada thread aktif"}
                </span>
                <span className="text-[#444444]">•</span>
                <span className="text-[#888888]">{telemetry.latencyMs}ms</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleNewMission}
            disabled={noProject}
            title="Mulai misi baru (thread baru)"
            className="p-1.5 rounded text-[#777777] hover:text-[#cccccc] hover:bg-[#222222] disabled:opacity-30 transition-colors"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Model Picker + Shared Memory badge */}
        <div className="px-3 py-1.5 border-b border-[#242424] bg-[#161616] flex items-center gap-2">
          <Cpu size={13} className="text-[#777777] shrink-0" />
          <ModelSelectorTrigger
            selectedModel={selectedModel}
            models={models}
            onClick={() => setModelPickerOpen(true)}
            disabled={isThinking}
          />
          <button
            onClick={loadModels}
            disabled={isRefreshingModels}
            title={modelsError ? `Gagal memuat model: ${modelsError}` : "Muat ulang daftar model"}
            className={`p-1.5 rounded hover:bg-[#222222] transition-colors ${
              modelsError ? "text-rose-400" : "text-[#777777] hover:text-[#cccccc]"
            }`}
          >
            <RefreshCw
              size={12}
              className={isRefreshingModels ? "animate-spin text-[#007acc]" : ""}
            />
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
          {loadingThread && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#666666] px-1">
              <Loader2 size={11} className="animate-spin text-[#007acc]" />
              <span>Memuat riwayat thread…</span>
            </div>
          )}

          {!loadingThread && messages.length === 0 && (
            <div className="p-3 rounded-lg bg-[#181818] border border-[#262626] text-xs text-[#cccccc] leading-relaxed">
              <div className="flex items-center gap-1.5 mb-2 text-[10px] text-[#666666] font-mono">
                <Bot size={10} className="text-[#007acc]" />
                <span className="text-[#a0a0a0] font-medium">Valence</span>
                <span>• baru saja</span>
              </div>
              <div className="whitespace-pre-wrap">{WELCOME_TEXT}</div>
            </div>
          )}

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
                      <span className="text-[#a0a0a0] font-medium">Valence</span>
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
                          Dispatched to 4 Desktop GUIs:
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
                              Mas Claude (The Architect)
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
                              Mbak Agy (The Coder & OS)
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
                              Bg Codex (The Reviewer)
                            </span>
                            <p className="text-[11px] text-[#b0b0b0] line-clamp-2 mt-0.5">
                              {msg.delegations.chatgptTask}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 🟣 Hermes Delegation */}
                      {msg.delegations.hermesTask && (
                        <div className="p-2 rounded bg-[#1c1426] border border-[#2e1d40] flex items-start gap-2">
                          <div className="p-1 rounded bg-[#2a1a3b] text-[#c084fc] mt-0.5 shrink-0">
                            <Bot size={11} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-semibold text-[#c084fc] block">
                              Hermes (The Adaptive Co-Pilot)
                            </span>
                            <p className="text-[11px] text-[#b0b0b0] line-clamp-2 mt-0.5">
                              {msg.delegations.hermesTask}
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

          {/* Live streaming bubble — teks tumbuh saat 9Router mengirim token */}
          {isThinking && streamingText !== null && streamingText.length > 0 && (
            <div className="flex flex-col items-start space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-[#666666] font-mono px-1">
                <Bot size={10} className="text-[#007acc]" />
                <span className="text-[#a0a0a0] font-medium">Valence</span>
                <span className="flex items-center gap-1 text-[#007acc]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#007acc] animate-pulse inline-block" />
                  streaming
                </span>
              </div>
              <div className="max-w-[92%] p-3 rounded-lg text-xs leading-relaxed bg-[#181818] text-[#cccccc] border border-[#007acc]/30">
                <div className="whitespace-pre-wrap">{streamingText}</div>
                <span className="inline-block w-1.5 h-3 bg-[#007acc] align-middle ml-0.5 animate-pulse" />
              </div>
            </div>
          )}

          {/* Thinking & Decomposing Mission Animation (sebelum token pertama tiba) */}
          {isThinking && (streamingText === null || streamingText.length === 0) && (
            <div className="flex flex-col items-start space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-[#777777] font-mono px-1">
                <Bot size={11} />
                <span>Valence</span>
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

        {/* Hasil misi terakhir dari agen (penutup loop delegasi) */}
        {missionResult && (
          <div
            className={`mx-3 mb-2 px-2.5 py-1.5 rounded-md border text-[10px] font-mono flex items-center gap-2 shrink-0 ${missionStatusMeta(missionResult.status).bg} ${missionStatusMeta(missionResult.status).border}`}
          >
            <RadioTower size={11} className={missionStatusMeta(missionResult.status).text} />
            <span className={`font-semibold ${missionStatusMeta(missionResult.status).text}`}>
              {missionStatusMeta(missionResult.status).label}
            </span>
            <span className="text-[#777777] truncate flex-1" title={missionResult.summary}>
              {missionResult.agent_id || "agen"} • {missionResult.summary || missionResult.task_id}
            </span>
          </div>
        )}

        {/* Toast: hasil misi diproses / export handoff */}
        {(missionToast || exportToast) && (
          <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-md bg-[#141c18] border border-[#1e2c24] text-[10px] font-mono text-[#10b981] flex items-center gap-2 shrink-0">
            <CheckCircle2 size={11} />
            <span className="truncate">{missionToast ?? exportToast}</span>
          </div>
        )}

        {/* Chat Input Bar */}
        <div className="p-3 bg-[#181818] border-t border-[#242424]">
          {/* Attachments preview list */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 max-h-20 overflow-y-auto">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#202020] border border-[#2e2e2e] text-[10px] font-mono text-[#d0d0d0]"
                >
                  <Paperclip size={10} className="text-[#007acc]" />
                  <span className="truncate max-w-[120px]" title={att.name}>
                    {att.name}
                  </span>
                  <span className="text-[#666666]">
                    ({Math.round((att.size / 1024) * 10) / 10}KB)
                  </span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    className="text-[#777777] hover:text-[#ef4444] transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder={
                noProject
                  ? "Pilih / buka project dulu di header…"
                  : attachments.length > 0
                  ? "Ketik instruksi tambahan untuk file yang dilampirkan... (Enter untuk kirim)"
                  : "Ketik tujuan proyek... (Enter untuk kirim)"
              }
              disabled={isThinking || noProject}
              className="w-full bg-[#131313] border border-[#282828] rounded-lg px-3 py-2 text-xs text-[#f0f0f0] placeholder:text-[#555555] focus:outline-none focus:border-[#007acc] resize-none pr-10 disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={(!inputValue.trim() && attachments.length === 0) || isThinking || noProject}
              className="absolute right-2 bottom-3 p-1.5 rounded bg-[#007acc] hover:bg-[#0062a3] disabled:opacity-30 text-white transition-colors"
            >
              <Send size={13} />
            </button>
          </div>

          <div className="flex items-center justify-between mt-2 text-[10px] text-[#555555] font-mono px-1">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Cpu size={10} className="text-[#777777]" />
                <span>9Router :20128</span>
              </span>

              {/* Blueprints Presets Trigger */}
              <button
                onClick={() => setBlueprintModalOpen(true)}
                title="Pilih Blueprint / Sprint Preset"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#202020] hover:bg-[#282828] text-[#007acc] border border-[#2e2e2e] transition-colors"
              >
                <Sparkles size={10} />
                <span>Blueprints</span>
              </button>

              {/* Attach File Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Lampirkan file teks atau kode"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#202020] hover:bg-[#282828] text-[#888888] hover:text-[#cccccc] border border-[#2e2e2e] transition-colors"
              >
                <Paperclip size={10} />
                <span>Attach</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleProcessFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <span>{noProject ? "Tidak ada project aktif" : "Shift+Enter untuk baris baru"}</span>
          </div>
        </div>
      </div>

      {/* Mission Blueprints Modal */}
      {blueprintModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => setBlueprintModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#181818] border border-[#2e2e2e] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-[#262626] bg-[#1a1a1a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#007acc]" />
                <h3 className="text-xs font-semibold text-white">Mission Blueprints / Templates</h3>
              </div>
              <button
                onClick={() => setBlueprintModalOpen(false)}
                className="p-1 rounded text-[#777777] hover:text-[#cccccc]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-3 space-y-2 overflow-y-auto">
              <p className="text-[11px] text-[#888888]">
                Pilih blueprint sprint untuk langsung memuat instruksi koordinasi ke Valence:
              </p>
              {MISSION_BLUEPRINTS.map((bp) => (
                <div
                  key={bp.id}
                  onClick={() => {
                    setInputValue(bp.prompt);
                    setBlueprintModalOpen(false);
                    soundFx.playRelayStep();
                    setTimeout(() => textareaRef.current?.focus(), 50);
                  }}
                  className="p-2.5 rounded-lg bg-[#141414] hover:bg-[#1f1f1f] border border-[#242424] hover:border-[#007acc]/50 cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{bp.icon}</span>
                    <span className="text-xs font-medium text-white group-hover:text-[#007acc] transition-colors">
                      {bp.title}
                    </span>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-[#202020] text-[#777777] ml-auto border border-[#2a2a2a]">
                      {bp.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#777777] mt-1 leading-relaxed">
                    {bp.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 9Router Ultra Model Picker Command Palette */}
      <ModelPickerModal
        open={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={handleModelChange}
        onRefreshModels={loadModels}
        isRefreshing={isRefreshingModels}
      />
    </div>
  );
};

export default MasterConductorChat;
