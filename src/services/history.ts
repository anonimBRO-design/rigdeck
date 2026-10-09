import { invoke } from "@tauri-apps/api/core";
import { AuditEvent, AuditHistoryItem } from "../types";
import { openVaultInObsidian } from "./sharedMemory";

/** Ambil audit trail mentah dari tabel agent_events (terbaru lebih dulu). */
export async function listAuditEvents(limit = 300): Promise<AuditEvent[]> {
  try {
    return await invoke<AuditEvent[]>("list_dag_events", { limit });
  } catch (err) {
    console.warn("Gagal memuat audit events:", err);
    return [];
  }
}

/** Catat event audit generik (dipakai untuk keputusan HITL, dll). */
export async function recordAuditEvent(
  agentId: string,
  eventType: string,
  payload: unknown
): Promise<void> {
  try {
    await invoke("record_dag_event", {
      agentId,
      eventType,
      payload: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Gagal mencatat audit event:", err);
  }
}

const AGENT_LABEL: Record<string, string> = {
  claude: "Mas Claude",
  antigravity: "Mbak Agy",
  chatgpt: "Bg Codex",
  conductor: "Valence",
  system: "System",
  user: "Afgan",
};

export function agentLabel(agentId: string): string {
  return AGENT_LABEL[agentId] ?? agentId;
}

function parsePayload(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Ubah baris agent_events menjadi item timeline yang siap dirender. */
export function toHistoryItems(events: AuditEvent[]): AuditHistoryItem[] {
  return events.map((e) => {
    const parsed = parsePayload(e.payload);
    const isHitl = e.event_type.startsWith("HITL_");
    const isMission =
      e.event_type === "MISSION_DELEGATED" ||
      e.event_type === "TASK_CREATED" ||
      e.event_type === "TASK_REASSIGNED" ||
      e.event_type === "TASK_STATUS_UPDATED";

    const kind: AuditHistoryItem["kind"] = isHitl
      ? "hitl"
      : isMission
        ? "mission"
        : "event";

    let title = e.event_type;
    let detail = e.payload;
    let status: string | undefined;

    if (e.event_type === "MISSION_DELEGATED" && parsed) {
      const targets = [
        parsed.claudeTask ? "Claude" : null,
        parsed.antigravityTask ? "Antigravity" : null,
        parsed.chatgptTask ? "ChatGPT" : null,
      ].filter(Boolean);
      title = `Delegasi misi → ${targets.join(", ") || "3 AI desktop"}`;
      detail = [
        parsed.claudeTask && `🟠 Claude: ${parsed.claudeTask}`,
        parsed.antigravityTask && `🔵 Antigravity: ${parsed.antigravityTask}`,
        parsed.chatgptTask && `⚪ ChatGPT: ${parsed.chatgptTask}`,
      ]
        .filter(Boolean)
        .join("\n");
    } else if (e.event_type === "TASK_CREATED" && parsed) {
      title = `Task dibuat: ${parsed.title ?? "-"}`;
      detail = `Assigned: ${parsed.assigned_agent ?? "unassigned"} • ID: ${parsed.task_id ?? "-"}`;
      status = "PENDING";
    } else if (e.event_type === "TASK_STATUS_UPDATED" && parsed) {
      title = `Status task ${parsed.task_id ?? ""} → ${parsed.status ?? "?"}`;
      detail = `Task ID: ${parsed.task_id ?? "-"}`;
      status = parsed.status;
    } else if (e.event_type === "TASK_REASSIGNED" && parsed) {
      title = `Task dialihkan ke ${agentLabel(parsed.assigned_agent ?? "")}`;
      detail = `Task ID: ${parsed.task_id ?? "-"}`;
    } else if (isHitl && parsed) {
      const approved = e.event_type === "HITL_APPROVED";
      title = `${approved ? "Disetujui" : "Ditolak"}: ${parsed.description ?? "aksi berisiko"}`;
      detail = `${parsed.command ?? ""}${parsed.riskLevel ? ` • risiko ${parsed.riskLevel}` : ""}`;
      status = approved ? "APPROVED" : "REJECTED";
    }

    return {
      id: `evt-${e.id}`,
      kind,
      agentId: e.agent_id,
      eventType: e.event_type,
      title,
      detail,
      status,
      timestamp: e.timestamp,
      payloadRaw: e.payload,
    };
  });
}

/** Buka file journal hari ini di Obsidian (vault path dari memory_status). */
export async function openJournalInObsidian(vaultPath: string): Promise<void> {
  await openVaultInObsidian(vaultPath);
}

/** Copy JSON audit ke clipboard, dengan fallback execCommand. */
export async function copyJsonToClipboard(json: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = json;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
