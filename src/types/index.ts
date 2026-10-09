export type AgentRole = "architect" | "coder" | "tester" | "reviewer" | "copilot" | "orchestrator";

export type AgentStatus = "idle" | "running" | "waiting_approval" | "error" | "completed" | "paused";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  model: string;
  status: AgentStatus;
  worktreePath?: string;
  currentTaskTitle?: string;
  tokensUsed: number;
}

export type TaskStatus = "backlog" | "in_progress" | "in_review" | "done";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgentId?: string;
  branchName?: string;
  diffSummary?: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

export type LayoutMode = "focus" | "split" | "matrix";

export interface HitlAction {
  id: string;
  agentId: string;
  agentName: string;
  command: string;
  riskLevel: "medium" | "critical";
  description: string;
}

export interface RouterTelemetry {
  online: boolean;
  activeModel: string;
  latencyMs: number;
  tokensProcessed: number;
  endpoint: string;
}


export type DagNodeStatus = "completed" | "in_progress" | "in_review" | "paused" | "pending";

export interface DagNodeData {
  id: string;
  title: string;
  subtitle: string;
  role: AgentRole;
  agentId: string;
  agentName: string;
  model: string;
  modelBadge: string;
  status: DagNodeStatus;
  branchName?: string;
  dependencies: string[];
  tokensUsed?: number;
}

export type GuiAppId = "claude" | "antigravity" | "chatgpt" | "hermes";

export interface GuiAgentCardState {
  appId: GuiAppId;
  name: string;
  role: string;
  model: string;
  status: "ready" | "working" | "reviewing" | "idle" | "disabled";
  currentTask: string;
  artifactOrBranch: string;
  telemetryNote?: string;
  enabled: boolean;
  manualRoleOverride?: AgentRole | null;
}

// ---------------------------------------------------------------------------
// Multi-Project, Conversation Sessions & Audit History
// ---------------------------------------------------------------------------

/** Proyek/workspace yang pernah dibuka (registry di ~/.config/rigdeck/projects.json). */
export interface ProjectItem {
  id: string;
  name: string;
  path: string;
  last_opened_at: string;
}

/** Satu thread percakapan Master Conductor (tabel `conversations`). */
export interface Conversation {
  id: string;
  project_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export type MessageSender = "user" | "conductor" | "system";

export interface Delegations {
  claudeTask?: string;
  antigravityTask?: string;
  chatgptTask?: string;
  hermesTask?: string;
}

/** Baris pesan yang dipersist ke `conversation_messages`. */
export interface PersistedMessage {
  id: string;
  conversation_id: string;
  sender: MessageSender;
  text: string;
  delegations_json: string | null;
  tokens_used: number;
  created_at: string;
}

/** Baris audit dari tabel `agent_events`. */
export interface AuditEvent {
  id: number;
  agent_id: string;
  event_type: string;
  payload: string;
  timestamp: string;
}

export type AuditKind = "mission" | "hitl" | "event";

/** Item timeline yang sudah dinormalisasi untuk HistoryModal. */
export interface AuditHistoryItem {
  id: string;
  kind: AuditKind;
  agentId: string;
  eventType: string;
  title: string;
  detail: string;
  status?: string;
  timestamp: string;
  payloadRaw: string;
}

/** Pesan chat di UI Master Conductor (sudah dinormalisasi dari DB). */
export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  /** Jam tampilan, mis. "15:42". */
  timestamp: string;
  /** ISO timestamp asli untuk persistensi. */
  createdAt: string;
  delegations?: Delegations;
  tokensUsed?: number;
}

// ---------------------------------------------------------------------------
// Auto-Relay Pipeline & Mission Control Modes
// ---------------------------------------------------------------------------

export type AutoRelayStage =
  | "idle"
  | "claude_spec"
  | "agy_coding"
  | "codex_review"
  | "ready_merge";

export interface AutoRelayState {
  enabled: boolean;
  stage: AutoRelayStage;
  activeMissionTitle?: string;
  lastUpdated?: string;
  error?: string | null;
}

/** Hasil pencarian full-text (FTS5) lintas thread. */
export interface SearchHit {
  message_id: string;
  conversation_id: string;
  conversation_title: string;
  project_id: string;
  sender: string;
  snippet: string;
  created_at: string;
  project_name?: string | null;
}
