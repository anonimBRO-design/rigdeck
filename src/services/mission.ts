import { invoke } from "@tauri-apps/api/core";
import { SearchHit } from "../types";

/** Isi `.rig/context/task_result.json` — kontrak balik dari agen. */
export interface TaskResult {
  task_id: string;
  status: string;
  agent_id: string;
  summary: string;
  artifacts: string[];
  completed_at: string;
}

/** Hasil polling penutup loop delegasi. */
export interface MissionPollOutcome {
  processed: boolean;
  task_result: TaskResult | null;
  dag_status: string | null;
  message: string;
}

/**
 * Poll `.rig/context/task_result.json`. Idempotent: hasil yang sudah pernah
 * diproses tidak akan diproses dua kali (di-dedupe di backend via tabel app_state).
 */
export async function pollMissionResult(): Promise<MissionPollOutcome | null> {
  try {
    return await invoke<MissionPollOutcome>("poll_mission_result");
  } catch (err) {
    console.warn("Gagal poll mission result:", err);
    return null;
  }
}

/** Lihat hasil misi tanpa memprosesnya (untuk preview). */
export async function peekMissionResult(): Promise<TaskResult | null> {
  try {
    return await invoke<TaskResult | null>("peek_mission_result");
  } catch {
    return null;
  }
}

export interface HandoffMessageInput {
  sender: string;
  text: string;
  created_at: string;
  target?: string | null;
}

/**
 * Ekspor satu percakapan menjadi catatan handoff di `rig-memory/handoffs/`.
 * Mengembalikan path relatif terhadap vault (mis. `handoffs/auth-jwt.md`).
 */
export async function exportConversationHandoff(
  title: string,
  conversationId: string,
  messages: HandoffMessageInput[],
  targetAgents: string[] = []
): Promise<string | null> {
  try {
    return await invoke<string>("export_conversation_handoff", {
      title,
      conversationId,
      messages,
      targetAgents,
    });
  } catch (err) {
    console.warn("Gagal mengekspor handoff:", err);
    return null;
  }
}

/** Cari pesan lintas thread lewat indeks FTS5. */
export async function searchMessages(query: string, limit = 20): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  try {
    return await invoke<SearchHit[]>("search_conversation_messages", { query, limit });
  } catch (err) {
    console.warn("Pencarian pesan gagal:", err);
    return [];
  }
}

/** Jumlah pesan yang terindeks FTS (indikator UI). */
export async function countIndexedMessages(): Promise<number> {
  try {
    return await invoke<number>("count_indexed_messages");
  } catch {
    return 0;
  }
}

/** Status hasil misi → warna & label UI. */
export function missionStatusMeta(status: string): {
  label: string;
  text: string;
  bg: string;
  border: string;
} {
  switch (status.trim().toUpperCase()) {
    case "COMPLETED":
    case "DONE":
    case "SUCCESS":
      return {
        label: "COMPLETED",
        text: "text-[#10b981]",
        bg: "bg-[#141c18]",
        border: "border-[#1e2c24]",
      };
    case "FAILED":
    case "ERROR":
      return {
        label: "FAILED",
        text: "text-[#ef4444]",
        bg: "bg-[#1e1616]",
        border: "border-[#3a2222]",
      };
    case "BLOCKED":
      return {
        label: "BLOCKED",
        text: "text-[#d97706]",
        bg: "bg-[#1a1714]",
        border: "border-[#2e261e]",
      };
    case "IN_PROGRESS":
    case "RUNNING":
      return {
        label: "IN PROGRESS",
        text: "text-[#007acc]",
        bg: "bg-[#141920]",
        border: "border-[#1e2734]",
      };
    default:
      return {
        label: status.trim().toUpperCase() || "UNKNOWN",
        text: "text-[#a0a0a0]",
        bg: "bg-[#1a1a1a]",
        border: "border-[#2a2a2a]",
      };
  }
}
