export type AgentRole = "architect" | "coder" | "tester" | "reviewer";

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

export type GuiAppId = "claude" | "antigravity" | "chatgpt";

export interface GuiAgentCardState {
  appId: GuiAppId;
  name: string;
  role: string;
  model: string;
  status: "ready" | "working" | "reviewing" | "idle";
  currentTask: string;
  artifactOrBranch: string;
  telemetryNote?: string;
}
