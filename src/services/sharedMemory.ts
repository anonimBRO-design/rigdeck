import { invoke } from "@tauri-apps/api/core";

/** Nama agent yang dipakai di journal shared memory. */
export type MemoryAgent = "conductor" | "claude" | "antigravity" | "chatgpt" | "hermes" | "user";
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

export interface MilestoneRecapParams {
  missionTitle: string;
  summary?: string;
  claudeTask?: string;
  antigravityTask?: string;
  chatgptTask?: string;
  hermesTask?: string;
  branch?: string;
}

/**
 * Otomatis menulis rekapan milestone harian ke rig-memory/journal/YYYY-MM-DD.md
 * berformat Obsidian dengan tags dan wiki-links.
 */
export async function syncObsidianDailyRecap(params: MilestoneRecapParams): Promise<void> {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const lines = [
    `### 🎯 Milestone: ${params.missionTitle || "Development Mission"} (${time})`,
    `- **Status:** ✅ COMPLETED & APPROVED`,
    `- **Orchestrator:** Valence • 9Router`,
    `- **Delegasi Agen:**`,
    params.claudeTask ? `  - 🟠 **Mas Claude:** ${params.claudeTask}` : null,
    params.antigravityTask ? `  - 🔵 **Mbak Agy:** ${params.antigravityTask}` : null,
    params.chatgptTask ? `  - ⚪ **Bg Codex:** ${params.chatgptTask}` : null,
    params.hermesTask ? `  - 🟣 **Hermes:** ${params.hermesTask}` : null,
    params.branch ? `- **Artifact / Branch:** \`${params.branch}\`` : null,
    params.summary ? `- **Ringkasan:** ${params.summary}` : null,
    `- **Wiki Links:** [[01-Project-Context]], [[02-Decisions]]`,
    `- **Tags:** #rigdeck #milestone #done`,
    "",
  ].filter(Boolean) as string[];

  await appendMemory("conductor", "decision", lines.join("\n"));
}

