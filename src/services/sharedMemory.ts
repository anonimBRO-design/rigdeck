import { invoke } from "@tauri-apps/api/core";

/** Nama agent yang dipakai di journal shared memory. */
export type MemoryAgent = "conductor" | "claude" | "antigravity" | "chatgpt" | "user";
export type MemoryKind = "mission" | "progress" | "decision" | "handoff" | "review" | "blocker";

export interface MemoryStatus {
  vault_path: string;
  note_count: number;
  journal_today: string;
}

/** Konteks memori untuk disuntikkan ke system prompt Master Conductor. */
export async function readMemoryContext(maxChars = 12000): Promise<string> {
  try {
    return await invoke<string>("memory_read_context", { maxChars });
  } catch (err) {
    console.warn("Shared memory tidak tersedia:", err);
    return "";
  }
}

export async function appendMemory(
  agent: MemoryAgent,
  kind: MemoryKind,
  content: string
): Promise<void> {
  try {
    await invoke("memory_append", { agent, kind, content });
  } catch (err) {
    console.warn("Gagal menulis shared memory:", err);
  }
}

export async function getMemoryStatus(): Promise<MemoryStatus | null> {
  try {
    return await invoke<MemoryStatus>("memory_status");
  } catch {
    return null;
  }
}

export async function getJournalTail(lines = 20): Promise<string[]> {
  try {
    return await invoke<string[]>("memory_journal_tail", { lines });
  } catch {
    return [];
  }
}

/** Buka vault di Obsidian (vault harus sudah didaftarkan sekali via "Open folder as vault"). */
export async function openVaultInObsidian(vaultPath: string): Promise<void> {
  const url = `obsidian://open?path=${encodeURIComponent(`${vaultPath}/00-INDEX.md`)}`;
  await invoke("dispatch_gui_url", { url });
}
