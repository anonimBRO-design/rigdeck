import { create } from "zustand";
import { Agent, Task, LayoutMode, HitlAction, RouterTelemetry, GuiAppId, GuiAgentCardState } from "../types";

interface RigStore {
  agents: Agent[];
  tasks: Task[];
  layoutMode: LayoutMode;
  selectedAgentId: string;
  activeHitlAction: HitlAction | null;
  telemetry: RouterTelemetry;
  selectedDiffTask: Task | null;

  setLayoutMode: (mode: LayoutMode) => void;
  setSelectedAgentId: (id: string) => void;
  setActiveHitlAction: (action: HitlAction | null) => void;
  setSelectedDiffTask: (task: Task | null) => void;
  approveHitlAction: (id: string) => void;
  rejectHitlAction: (id: string) => void;
  approveMergeTask: (taskId: string) => void;
  addTask: (title: string, description: string) => void;
  togglePauseAgent: (agentId: string) => void;
  injectReviewPrompt: (agentId: string, prompt: string) => void;
  guiCards: Record<GuiAppId, GuiAgentCardState>;
  updateGuiCard: (appId: GuiAppId, updates: Partial<GuiAgentCardState>) => void;
  dispatchMissionDelegations: (delegations: { claudeTask?: string; antigravityTask?: string; chatgptTask?: string }) => void;
}

export const useRigStore = create<RigStore>((set) => ({
  agents: [
    {
      id: "agent-arch",
      name: "Lead Architect",
      role: "architect",
      model: "claude-opus-5.5 (1M)",
      status: "idle",
      tokensUsed: 12450,
      currentTaskTitle: "System Design & Task Decomposition",
    },
    {
      id: "agent-coder",
      name: "Feature Developer",
      role: "coder",
      model: "cl/claude-sonnet-4-6",
      status: "running",
      worktreePath: ".rig/worktrees/feat-auth",
      tokensUsed: 38290,
      currentTaskTitle: "Implement JWT session validation handler",
    },
    {
      id: "agent-tester",
      name: "QA & Test Engineer",
      role: "tester",
      model: "gemini-3.5-flash",
      status: "running",
      worktreePath: ".rig/worktrees/test-auth",
      tokensUsed: 19410,
      currentTaskTitle: "Running Vitest test suite for auth endpoints",
    },
    {
      id: "agent-reviewer",
      name: "Security Reviewer",
      role: "reviewer",
      model: "claude-opus-5.5 (1M)",
      status: "waiting_approval",
      tokensUsed: 8900,
      currentTaskTitle: "Auditing diff & token leak check for feat-auth",
    },
  ],
  tasks: [
    {
      id: "task-101",
      title: "Scaffold auth middleware & JWT signing",
      description: "Setup token parsing, cookie verification, and role guard",
      status: "in_review",
      assignedAgentId: "agent-coder",
      branchName: "rig/feat-auth",
      diffSummary: { filesChanged: 4, insertions: 142, deletions: 18 },
    },
    {
      id: "task-102",
      title: "Write unit & integration tests for auth",
      description: "Test expired tokens, invalid claims, and revocation",
      status: "in_progress",
      assignedAgentId: "agent-tester",
      branchName: "rig/test-auth",
      diffSummary: { filesChanged: 2, insertions: 86, deletions: 4 },
    },
    {
      id: "task-103",
      title: "Setup SQLite WAL state blackboard",
      description: "Create tables for tasks, agent events, and worktree locks",
      status: "done",
      assignedAgentId: "agent-arch",
      branchName: "rig/db-blackboard",
      diffSummary: { filesChanged: 3, insertions: 210, deletions: 0 },
    },
  ],
  layoutMode: "split",
  selectedAgentId: "agent-coder",
  activeHitlAction: {
    id: "hitl-01",
    agentId: "agent-coder",
    agentName: "Feature Developer",
    command: "git push origin --force-with-lease rig/feat-auth",
    riskLevel: "medium",
    description: "Coder agent is attempting to force push branch updates to remote.",
  },
  telemetry: {
    online: true,
    activeModel: "9Router :20128 (Multi-Model Pool)",
    latencyMs: 38,
    tokensProcessed: 78950,
    endpoint: "http://127.0.0.1:20128/v1",
  },
  selectedDiffTask: null,

  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setActiveHitlAction: (action) => set({ activeHitlAction: action }),
  setSelectedDiffTask: (task) => set({ selectedDiffTask: task }),

  approveHitlAction: () => set({ activeHitlAction: null }),
  rejectHitlAction: () => set({ activeHitlAction: null }),

  approveMergeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, status: "done" } : t
      ),
      selectedDiffTask: null,
    })),

  addTask: (title, description) =>
    set((state) => ({
      tasks: [
        ...state.tasks,
        {
          id: `task-${Date.now().toString().slice(-3)}`,
          title,
          description,
          status: "backlog",
        },
      ],
    })),

  togglePauseAgent: (agentId) =>
    set((state) => ({
      agents: state.agents.map((a) => {
        if (a.id !== agentId) return a;
        const nextStatus = a.status === "paused" ? "running" : "paused";
        return { ...a, status: nextStatus };
      }),
    })),

  injectReviewPrompt: (agentId, prompt) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status: "running",
              currentTaskTitle: "[Review Injected]: " + prompt,
            }
          : a
      ),
    })),

  guiCards: {
    claude: {
      appId: "claude",
      name: "Claude Desktop",
      role: "The Architect",
      model: "Claude Opus 5.5",
      status: "ready",
      currentTask: "Design System Architecture & Task Decomposition for RigDeck v1.1",
      artifactOrBranch: "docs/spec-auth-v1.1.md",
      telemetryNote: "RFC generated with 0 ambiguity",
    },
    antigravity: {
      appId: "antigravity",
      name: "Antigravity IDE",
      role: "The Coder & OS",
      model: "Gemini 2.5 Flash / Agent OS",
      status: "working",
      currentTask: "Implement JWT session validation & scaffold isolated git worktrees",
      artifactOrBranch: "rig/feat-auth (.rig/worktrees/feat-auth)",
      telemetryNote: "Running build & test suite",
    },
    chatgpt: {
      appId: "chatgpt",
      name: "ChatGPT Desktop",
      role: "The Reviewer",
      model: "GPT-5 Omni-Reasoning",
      status: "reviewing",
      currentTask: "Auditing git diff for secret leakage, token expiration & edge cases",
      artifactOrBranch: "+142 / -18 lines in feat-auth",
      telemetryNote: "Security grade: A+ verified",
    },
  },

  updateGuiCard: (appId, updates) =>
    set((state) => ({
      guiCards: {
        ...state.guiCards,
        [appId]: {
          ...state.guiCards[appId],
          ...updates,
        },
      },
    })),

  dispatchMissionDelegations: (delegations) =>
    set((state) => {
      const nextCards = { ...state.guiCards };
      if (delegations.claudeTask) {
        nextCards.claude = {
          ...nextCards.claude,
          currentTask: delegations.claudeTask,
          status: "working",
        };
      }
      if (delegations.antigravityTask) {
        nextCards.antigravity = {
          ...nextCards.antigravity,
          currentTask: delegations.antigravityTask,
          status: "working",
        };
      }
      if (delegations.chatgptTask) {
        nextCards.chatgpt = {
          ...nextCards.chatgpt,
          currentTask: delegations.chatgptTask,
          status: "reviewing",
        };
      }
      return { guiCards: nextCards };
    }),
}));