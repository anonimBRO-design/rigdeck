export interface ConductorMessage {
  id: string;
  sender: "user" | "conductor";
  text: string;
  timestamp: string;
  delegations?: {
    claudeTask?: string;
    antigravityTask?: string;
    chatgptTask?: string;
    hermesTask?: string;
  };
}

export interface ConductorTaskPayload {
  $schema: string;
  version: string;
  task_metadata: {
    task_id: string;
    parent_id: string | null;
    timestamp: string;
    conductor: string;
  };
  assignment: {
    target_role: string;
    target_app: string;
    collaborators: Array<{
      role: string;
      app: string;
      worktree?: string;
      task?: string;
    }>;
  };
  workspace: {
    project_name: string;
    root_path: string;
    target_branch: string;
    active_worktree: string | null;
  };
  mission: {
    title: string;
    high_level_goal: string;
    deliverables: Array<{
      file: string;
      format: string;
      description: string;
    }>;
    technical_constraints: string[];
  };
  return_instructions: {
    on_complete: string;
  };
  shared_memory: {
    vault: string;
    read_first: string[];
    write_back: string;
    protocol: string;
  };
}

export const CONDUCTOR_SYSTEM_PROMPT = `You are Valence, RigDeck's Master AI Conductor, powered by 9Router.
Your job is to orchestrate a team of desktop AI agents running on the user's machine:
1. 🟠 Mas Claude (The Architect - Claude Desktop): Best for system architecture, RFCs, and high-level technical design.
2. 🔵 Mbak Agy (The Coder & OS Engine - Antigravity IDE): Best for autonomous codebase editing, bash terminal execution, git worktrees, and OS tasks.
3. ⚪ Bg Codex (The Reviewer - ChatGPT Desktop / Codex): Best for 3-way diff review, edge-case testing, and security auditing.
4. 🟣 Hermes (The Adaptive Co-Pilot): Flexible autonomous agent that covers any inactive agents or operates as an all-round speed co-pilot.

When the user gives you a software development objective:
1. Break down the mission into clear, actionable roles for the active agents.
2. Output a brief, enthusiastic summary to the user explaining how the AIs will collaborate.
3. Include a JSON block at the very end in this exact format:
\`\`\`json
{
  "claude_task": "Concise task for Mas Claude",
  "antigravity_task": "Concise task for Mbak Agy",
  "chatgpt_task": "Concise task for Bg Codex",
  "hermes_task": "Concise task for Hermes (optional/adaptive)"
}
\`\`\`
Always respond in concise, friendly Indonesian.`;

export function createConductorTaskJson(
  title: string,
  claudeTask: string,
  antigravityTask?: string,
  chatgptTask?: string,
  workspace?: { projectName: string; rootPath: string }
): ConductorTaskPayload {
  return {
    $schema: "https://rigdeck.dev/schemas/v1/conductor-task.json",
    version: "1.0",
    task_metadata: {
      task_id: `RIG-TASK-${Date.now().toString(36).toUpperCase()}`,
      parent_id: null,
      timestamp: new Date().toISOString(),
      conductor: "Valence (9Router Master Conductor)",
    },
    assignment: {
      target_role: "LEAD_ARCHITECT",
      target_app: "Mas Claude",
      collaborators: [
        {
          role: "FEATURE_DEVELOPER",
          app: "Mbak Agy",
          worktree: ".rig/worktrees/feat-impl",
          task: antigravityTask || "Scaffold and implement feature in isolated worktree",
        },
        {
          role: "CODE_REVIEWER",
          app: "Bg Codex",
          task: chatgptTask || "Perform 3-way security and edge-case code review",
        },
      ],
    },
    workspace: {
      project_name: workspace?.projectName ?? "RigDeck Project",
      root_path: workspace?.rootPath ?? "",
      target_branch: "rig/arch-spec-v1",
      active_worktree: null,
    },
    mission: {
      title,
      high_level_goal: claudeTask,
      deliverables: [
        {
          file: "docs/architecture/SPEC.md",
          format: "markdown",
          description: "Dokumen arsitektur lengkap beserta diagram mermaid.",
        },
        {
          file: ".rig/blackboard/subtasks.json",
          format: "json",
          description: "Daftar sub-tiket yang siap didelegasikan ke Antigravity & ChatGPT.",
        },
      ],
      technical_constraints: [
        "Gunakan Rust Tauri v2 IPC commands untuk sisi backend",
        "Gunakan SQLite WAL mode untuk persistensi",
        "Terapkan isolasi Git Worktree untuk setiap agen",
      ],
    },
    return_instructions: {
      on_complete:
        "Tulis ringkasan hasil ke rig-memory/journal/YYYY-MM-DD.md (format di AGENTS.md) dan status COMPLETED ke .rig/context/task_result.json agar Master AI Conductor bisa melanjutkan delegasi.",
    },
    shared_memory: {
      vault: "rig-memory/",
      read_first: [
        "rig-memory/00-INDEX.md",
        "rig-memory/01-Project-Context.md",
        "rig-memory/02-Decisions.md",
        "rig-memory/journal/ (file terbaru)",
      ],
      write_back: "rig-memory/journal/YYYY-MM-DD.md",
      protocol: "AGENTS.md",
    },
  };
}

// ---------------------------------------------------------------------------
// 9Router model catalog
// ---------------------------------------------------------------------------
export const ROUTER_BASE_URL = "http://127.0.0.1:20128/v1";
export const DEFAULT_CONDUCTOR_MODEL = "claude-opus-5.5";

export interface RouterModel {
  id: string;
  owned_by?: string;
  contextWindow?: number;
  maxOutput?: number;
  reasoning?: boolean;
  vision?: boolean;
  tools?: boolean;
  search?: boolean;
}

export async function fetchRouterModels(): Promise<RouterModel[]> {
  const res = await fetch(`${ROUTER_BASE_URL}/models`);
  if (!res.ok) throw new Error(`9Router /models error ${res.status}`);
  const json = await res.json();
  return (json.data || []).map((m: any) => {
    const isReasoning =
      m.capabilities?.reasoning ??
      m.id.toLowerCase().includes("thinking") ??
      m.id.toLowerCase().includes("reasoning") ??
      m.id.toLowerCase().includes("r1");

    return {
      id: m.id,
      owned_by: m.owned_by,
      contextWindow: m.capabilities?.contextWindow ?? m.context_length,
      maxOutput: m.capabilities?.maxOutput ?? m.max_completion_tokens,
      reasoning: isReasoning,
      vision: m.capabilities?.vision,
      tools: m.capabilities?.tools,
      search: m.capabilities?.search,
    };
  });
}

export interface ModelFamilyMeta {
  key: string;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentColor: string;
}

export function getModelFamily(modelId: string): ModelFamilyMeta {
  const id = modelId.toLowerCase();
  if (id.includes("claude") || id.includes("anthropic")) {
    return {
      key: "claude",
      label: "Claude",
      badgeBg: "bg-amber-500/10",
      badgeText: "text-amber-400",
      badgeBorder: "border-amber-500/30",
      accentColor: "#d97706",
    };
  }
  if (id.includes("gemini")) {
    return {
      key: "gemini",
      label: "Gemini",
      badgeBg: "bg-blue-500/10",
      badgeText: "text-blue-400",
      badgeBorder: "border-blue-500/30",
      accentColor: "#3b82f6",
    };
  }
  if (id.includes("gpt") || id.includes("openai") || id.includes("o1") || id.includes("o3") || id.includes("chatgpt")) {
    return {
      key: "openai",
      label: "OpenAI",
      badgeBg: "bg-emerald-500/10",
      badgeText: "text-emerald-400",
      badgeBorder: "border-emerald-500/30",
      accentColor: "#10b981",
    };
  }
  if (id.includes("deepseek")) {
    return {
      key: "deepseek",
      label: "DeepSeek",
      badgeBg: "bg-cyan-500/10",
      badgeText: "text-cyan-400",
      badgeBorder: "border-cyan-500/30",
      accentColor: "#06b6d4",
    };
  }
  if (id.includes("qwen")) {
    return {
      key: "qwen",
      label: "Qwen",
      badgeBg: "bg-violet-500/10",
      badgeText: "text-violet-400",
      badgeBorder: "border-violet-500/30",
      accentColor: "#8b5cf6",
    };
  }
  if (id.includes("llama")) {
    return {
      key: "llama",
      label: "Llama",
      badgeBg: "bg-purple-500/10",
      badgeText: "text-purple-400",
      badgeBorder: "border-purple-500/30",
      accentColor: "#a855f7",
    };
  }
  if (id.includes("mistral") || id.includes("codestral") || id.includes("devstral")) {
    return {
      key: "mistral",
      label: "Mistral",
      badgeBg: "bg-orange-500/10",
      badgeText: "text-orange-400",
      badgeBorder: "border-orange-500/30",
      accentColor: "#f97316",
    };
  }
  if (id.includes("grok")) {
    return {
      key: "grok",
      label: "Grok",
      badgeBg: "bg-zinc-500/10",
      badgeText: "text-zinc-300",
      badgeBorder: "border-zinc-500/30",
      accentColor: "#a1a1aa",
    };
  }
  return {
    key: "other",
    label: "LLM",
    badgeBg: "bg-slate-500/10",
    badgeText: "text-slate-400",
    badgeBorder: "border-slate-500/30",
    accentColor: "#64748b",
  };
}

export function formatModelDisplayName(modelId: string): string {
  // Extract main name without provider prefix if any
  let name = modelId;
  if (name.includes("/")) {
    const parts = name.split("/");
    name = parts[parts.length - 1];
  }
  // Remove known common prefixes like @cf/
  name = name.replace(/^@cf\//, "");

  // Clean hyphens and underscores
  const words = name.replace(/[-_]/g, " ").split(" ").filter(Boolean);
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (lower === "gpt") return "GPT";
      if (lower === "llm") return "LLM";
      if (lower === "ai") return "AI";
      if (lower === "api") return "API";
      if (lower === "code") return "Code";
      if (lower === "high") return "(High)";
      if (lower === "medium" || lower === "med") return "(Medium)";
      if (lower === "low") return "(Low)";
      if (lower === "extra-low") return "(Extra Low)";
      if (lower === "thinking") return "(Thinking)";
      // Keep version numbers as-is, capitalize normal words
      if (/\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function formatContextWindow(tokens?: number): string {
  if (!tokens || tokens <= 0) return "";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return `${tokens}`;
}

/** Kelompokkan model per prefix provider (`ag/…`, `10/…`, tanpa prefix = combo/alias). */
export function groupModels(models: RouterModel[]): Record<string, RouterModel[]> {
  const groups: Record<string, RouterModel[]> = {};
  for (const m of models) {
    const key = m.id.includes("/") ? m.id.split("/")[0] : "combo / alias";
    (groups[key] ||= []).push(m);
  }
  return groups;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ConductorStreamHandlers {
  /** Dipanggil setiap potongan teks baru tiba (teks kumulatif). */
  onChunk?: (accumulatedText: string) => void;
  /** Dipanggil saat token usage diketahui. */
  onUsage?: (tokensUsed: number) => void;
}

export interface ConductorReply {
  replyText: string;
  delegations?: ConductorMessage["delegations"];
  tokensUsed: number;
}

/** Ekstrak blok delegasi dari teks balasan Conductor. */
function extractDelegations(content: string): {
  delegations?: ConductorMessage["delegations"];
  cleanText: string;
} {
  let delegations: ConductorMessage["delegations"] | undefined;
  const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      delegations = {
        claudeTask: parsed.claude_task,
        antigravityTask: parsed.antigravity_task,
        chatgptTask: parsed.chatgpt_task,
        hermesTask: parsed.hermes_task,
      };
    } catch (e) {
      console.warn("Could not parse delegation JSON", e);
    }
  }
  // Buang blok JSON mentah agar bubble chat tetap bersih
  const cleanText = content.replace(/```json[\s\S]*?```/, "").trim();
  return { delegations, cleanText: cleanText || content };
}

/**
 * Kirim prompt ke 9Router dengan streaming SSE.
 *
 * Bila server tidak mengirim SSE (balasan JSON biasa) atau streaming gagal,
 * fungsi ini otomatis fallback ke mode non-streaming sehingga hasilnya tetap utuh.
 */
export async function sendConductorPrompt(
  prompt: string,
  model = DEFAULT_CONDUCTOR_MODEL,
  options: {
    memoryContext?: string;
    history?: ChatTurn[];
    onChunk?: (accumulatedText: string) => void;
    signal?: AbortSignal;
  } = {}
): Promise<ConductorReply> {
  const url = `${ROUTER_BASE_URL}/chat/completions`;
  const { memoryContext, history = [], onChunk, signal } = options;

  const systemPrompt = memoryContext
    ? `${CONDUCTOR_SYSTEM_PROMPT}

## SHARED MEMORY (rig-memory/) — dibagi dengan Claude, Antigravity, dan ChatGPT
Gunakan ini sebagai sumber kebenaran tentang proyek, keputusan, dan progres terakhir.
Jangan bertentangan dengan keputusan di 02-Decisions tanpa menyebutkannya secara eksplisit.
${memoryContext}`
    : CONDUCTOR_SYSTEM_PROMPT;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.slice(-10),
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`9Router error ${response.status}: ${await response.text()}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    // --- Jalur streaming ---
    if (response.body && contentType.includes("text/event-stream")) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      let tokensUsed = 0;
      let sawSse = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Simpan baris terakhir yang mungkin belum lengkap
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr) continue;
          if (dataStr === "[DONE]") continue;

          try {
            const chunk = JSON.parse(dataStr);
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              sawSse = true;
              content += delta;
              onChunk?.(content);
            }
            if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
          } catch {
            // Baris SSE parsial/keep-alive — abaikan, tidak menghentikan stream.
          }
        }
      }

      // Sisa buffer (baris terakhir tanpa newline)
      const tail = buffer.trim();
      if (tail.startsWith("data:")) {
        const dataStr = tail.slice(5).trim();
        if (dataStr && dataStr !== "[DONE]") {
          try {
            const chunk = JSON.parse(dataStr);
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              content += delta;
              onChunk?.(content);
            }
            if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
          } catch {
            /* abaikan */
          }
        }
      }

      if (sawSse && content) {
        const { delegations, cleanText } = extractDelegations(content);
        // Sinkronkan teks akhir (tanpa blok JSON) ke UI
        onChunk?.(cleanText);
        return { replyText: cleanText, delegations, tokensUsed };
      }
      // Server mengaku SSE tapi tidak mengirim delta apa pun → fallback
    }

    // --- Jalur non-streaming (fallback) ---
    const textData = await response.text();
    let content = "";
    let tokensUsed = 0;

    for (const line of textData.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") continue;
        try {
          const parsedChunk = JSON.parse(dataStr);
          content += parsedChunk.choices?.[0]?.delta?.content || "";
          if (parsedChunk.usage?.total_tokens) tokensUsed = parsedChunk.usage.total_tokens;
        } catch {
          /* abaikan */
        }
      }
    }

    if (!content) {
      try {
        const jsonData = JSON.parse(textData);
        content = jsonData.choices?.[0]?.message?.content || "";
        if (jsonData.usage?.total_tokens) tokensUsed = jsonData.usage.total_tokens;
      } catch {
        content = textData;
      }
    }

    const { delegations, cleanText } = extractDelegations(content);
    onChunk?.(cleanText);
    return { replyText: cleanText, delegations, tokensUsed };
  } catch (error) {
    // Abort dari user bukan error — kembalikan teks kosong agar UI tidak menampilkan pesan gagal.
    if (error instanceof DOMException && error.name === "AbortError") {
      return { replyText: "", tokensUsed: 0 };
    }
    console.error("Conductor AI fetch error:", error);
    return {
      replyText: `[Error dari 9Router]: Gagal menghubungi 9Router di port 20128. Pastikan 9Router sedang aktif. Error: ${error}`,
      tokensUsed: 0,
    };
  }
}
