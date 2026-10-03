export interface ConductorMessage {
  id: string;
  sender: "user" | "conductor";
  text: string;
  timestamp: string;
  delegations?: {
    claudeTask?: string;
    antigravityTask?: string;
    chatgptTask?: string;
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

export const CONDUCTOR_SYSTEM_PROMPT = `You are RigDeck's Master AI Conductor, powered by 9Router.
Your job is to orchestrate a team of three powerful desktop AI applications running on the user's Linux machine:
1. 🟠 Claude Desktop (The Architect): Best for system architecture, RFCs, and high-level technical design.
2. 🔵 Antigravity IDE (The Coder & OS Engine): Best for autonomous codebase editing, bash terminal execution, git worktrees, and Linux OS tasks.
3. ⚪ ChatGPT Desktop (The Reviewer): Best for 3-way diff review, edge-case testing, and security auditing.

When the user gives you a software development objective:
1. Break down the mission into clear, actionable roles for the 3 GUIs.
2. Output a brief, enthusiastic summary to the user explaining how the 3 AIs will collaborate.
3. Include a JSON block at the very end in this exact format:
\`\`\`json
{
  "claude_task": "Concise task for Claude Desktop",
  "antigravity_task": "Concise task for Antigravity IDE",
  "chatgpt_task": "Concise task for ChatGPT Desktop"
}
\`\`\`
Always respond in concise, friendly Indonesian.`;

export function createConductorTaskJson(
  title: string,
  claudeTask: string,
  antigravityTask?: string,
  chatgptTask?: string
): ConductorTaskPayload {
  return {
    $schema: "https://rigdeck.dev/schemas/v1/conductor-task.json",
    version: "1.0",
    task_metadata: {
      task_id: `RIG-TASK-${Date.now().toString(36).toUpperCase()}`,
      parent_id: null,
      timestamp: new Date().toISOString(),
      conductor: "9Router-Master-Conductor (claude-opus-5.5)",
    },
    assignment: {
      target_role: "LEAD_ARCHITECT",
      target_app: "Claude Desktop",
      collaborators: [
        {
          role: "FEATURE_DEVELOPER",
          app: "Antigravity IDE",
          worktree: ".rig/worktrees/feat-impl",
          task: antigravityTask || "Scaffold and implement feature in isolated worktree",
        },
        {
          role: "CODE_REVIEWER",
          app: "ChatGPT Desktop",
          task: chatgptTask || "Perform 3-way security and edge-case code review",
        },
      ],
    },
    workspace: {
      project_name: "RigDeck Project",
      root_path: "/home/anonimbro/Projects/rigdeck",
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
  reasoning?: boolean;
}

export async function fetchRouterModels(): Promise<RouterModel[]> {
  const res = await fetch(`${ROUTER_BASE_URL}/models`);
  if (!res.ok) throw new Error(`9Router /models error ${res.status}`);
  const json = await res.json();
  return (json.data || []).map((m: any) => ({
    id: m.id,
    owned_by: m.owned_by,
    contextWindow: m.capabilities?.contextWindow ?? m.context_length,
    reasoning: m.capabilities?.reasoning,
  }));
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

export async function sendConductorPrompt(
  prompt: string,
  model = DEFAULT_CONDUCTOR_MODEL,
  options: { memoryContext?: string; history?: ChatTurn[]; onChunk?: (chunk: string) => void } = {}
): Promise<{ replyText: string; delegations?: ConductorMessage["delegations"] }> {
  const url = `${ROUTER_BASE_URL}/chat/completions`;
  const { memoryContext, history = [], onChunk } = options;

  const systemPrompt = memoryContext
    ? `${CONDUCTOR_SYSTEM_PROMPT}

## SHARED MEMORY (rig-memory/) — dibagi dengan Claude, Antigravity, dan ChatGPT
Gunakan ini sebagai sumber kebenaran tentang proyek, keputusan, dan progres terakhir.
Jangan bertentangan dengan keputusan di 02-Decisions tanpa menyebutkannya secara eksplisit.
${memoryContext}`
    : CONDUCTOR_SYSTEM_PROMPT;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-10),
          { role: "user", content: prompt },
        ],
        stream: false,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`9Router error ${response.status}: ${await response.text()}`);
    }

    const textData = await response.text();
    let content = "";

    // Parse SSE lines if returned in SSE format (data: {...})
    for (const line of textData.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6).trim();
        if (dataStr === "[DONE]") continue;
        try {
          const parsedChunk = JSON.parse(dataStr);
          content += parsedChunk.choices?.[0]?.delta?.content || "";
        } catch {}
      }
    }

    // If not SSE, try direct JSON parsing
    if (!content) {
      try {
        const jsonData = JSON.parse(textData);
        content = jsonData.choices?.[0]?.message?.content || "";
      } catch {
        content = textData;
      }
    }

    if (onChunk && content) onChunk(content);

    // Extract delegations JSON if present
    let delegations: ConductorMessage["delegations"] | undefined;
    const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        delegations = {
          claudeTask: parsed.claude_task,
          antigravityTask: parsed.antigravity_task,
          chatgptTask: parsed.chatgpt_task,
        };
      } catch (e) {
        console.warn("Could not parse delegation JSON", e);
      }
    }

    // Clean reply text by removing raw json block for cleaner chat bubbles
    const cleanText = content.replace(/```json[\s\S]*?```/, "").trim();

    return { replyText: cleanText || content, delegations };
  } catch (error) {
    console.error("Conductor AI fetch error:", error);
    return {
      replyText: `[Error dari 9Router]: Gagal menghubungi 9Router di port 20128. Pastikan 9Router sedang aktif. Error: ${error}`,
    };
  }
}
