import { invoke } from "@tauri-apps/api/core";
import { Conversation, Delegations, PersistedMessage } from "../types";

export async function createConversation(
  projectId: string,
  title: string,
  model: string
): Promise<Conversation> {
  return await invoke<Conversation>("create_conversation", { projectId, title, model });
}

export async function listConversations(projectId: string): Promise<Conversation[]> {
  try {
    return await invoke<Conversation[]>("list_conversations", { projectId });
  } catch (err) {
    console.warn("Gagal memuat daftar conversation:", err);
    return [];
  }
}

export async function getConversationMessages(
  conversationId: string
): Promise<PersistedMessage[]> {
  try {
    return await invoke<PersistedMessage[]>("get_conversation_messages", { conversationId });
  } catch (err) {
    console.warn("Gagal memuat pesan conversation:", err);
    return [];
  }
}

export interface SaveMessageInput {
  id: string;
  conversationId: string;
  sender: "user" | "conductor" | "system";
  text: string;
  delegations?: Delegations;
  tokensUsed?: number;
  createdAt?: string;
}

/**
 * Simpan satu pesan. Bila ada delegations, backend juga mencatat
 * event `MISSION_DELEGATED` ke tabel agent_events (audit trail).
 */
export async function saveMessage(input: SaveMessageInput): Promise<void> {
  try {
    await invoke("save_message", {
      msg: {
        id: input.id,
        conversation_id: input.conversationId,
        sender: input.sender,
        text: input.text,
        delegations_json: input.delegations ? JSON.stringify(input.delegations) : null,
        tokens_used: input.tokensUsed ?? 0,
        created_at: input.createdAt ?? new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn("Gagal menyimpan pesan:", err);
  }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await invoke("delete_conversation", { conversationId });
}

export async function renameConversation(
  conversationId: string,
  newTitle: string
): Promise<void> {
  await invoke("rename_conversation", { conversationId, newTitle });
}

/** Judul default yang menandakan thread belum punya judul asli. */
export const DEFAULT_CONVERSATION_TITLE = "New Mission";

/** Buat judul otomatis dari prompt pertama (maks 48 karakter, satu baris). */
export function autoTitleFromPrompt(prompt: string, maxLen = 48): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return DEFAULT_CONVERSATION_TITLE;
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

export function isDefaultTitle(title: string): boolean {
  return !title.trim() || title.trim() === DEFAULT_CONVERSATION_TITLE;
}

/** Parse delegations_json dengan aman. */
export function parseDelegations(raw: string | null | undefined): Delegations | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Delegations;
    return undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Delegasi → Task DAG
// ---------------------------------------------------------------------------

/** Satu delegasi ke agen desktop, siap dibuatkan task DAG. */
export interface DelegationTaskSpec {
  agentId: string;
  agentLabel: string;
  title: string;
  description: string;
}

/** Petakan 3 delegasi Conductor menjadi spec task DAG (hanya yang terisi). */
export function buildDelegationTaskSpecs(
  missionTitle: string,
  delegations: Delegations
): DelegationTaskSpec[] {
  const specs: DelegationTaskSpec[] = [];
  if (delegations.claudeTask) {
    specs.push({
      agentId: "claude",
      agentLabel: "Claude Desktop",
      title: `[Spec] ${missionTitle}`,
      description: delegations.claudeTask,
    });
  }
  if (delegations.antigravityTask) {
    specs.push({
      agentId: "antigravity",
      agentLabel: "Antigravity IDE",
      title: `[Implementasi] ${missionTitle}`,
      description: delegations.antigravityTask,
    });
  }
  if (delegations.chatgptTask) {
    specs.push({
      agentId: "chatgpt",
      agentLabel: "ChatGPT Desktop",
      title: `[Review] ${missionTitle}`,
      description: delegations.chatgptTask,
    });
  }
  if (delegations.hermesTask) {
    specs.push({
      agentId: "hermes",
      agentLabel: "Hermes Agent",
      title: `[Adaptive] ${missionTitle}`,
      description: delegations.hermesTask,
    });
  }
  return specs;
}

/**
 * Buat task DAG untuk setiap delegasi Conductor.
 * Task pertama menjadi parent (root misi), sisanya menjadi sub-task,
 * sehingga TaskBoard & Task DAG Canvas langsung terisi otomatis.
 * Mengembalikan daftar ID task yang dibuat.
 */
export async function createDagTasksFromDelegations(
  missionTitle: string,
  delegations: Delegations
): Promise<string[]> {
  const specs = buildDelegationTaskSpecs(missionTitle, delegations);
  if (specs.length === 0) return [];

  const createdIds: string[] = [];
  // Delegasi pertama jadi root misi; sisanya menggantung di bawahnya.
  let rootTaskId: string | null = null;

  for (const spec of specs) {
    const parentId: string | null = rootTaskId;
    try {
      const task: { id: string } = await invoke<{ id: string }>("create_dag_task", {
        title: spec.title,
        description: spec.description,
        assignedAgent: spec.agentId,
        parentId,
      });
      createdIds.push(task.id);
      if (rootTaskId === null) rootTaskId = task.id;
    } catch (err) {
      console.warn(`Gagal membuat DAG task untuk ${spec.agentLabel}:`, err);
    }
  }

  return createdIds;
}
