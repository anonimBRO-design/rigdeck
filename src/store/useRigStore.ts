import { create } from "zustand";
import {
  Agent,
  Task,
  LayoutMode,
  HitlAction,
  RouterTelemetry,
  GuiAppId,
  GuiAgentCardState,
  ProjectItem,
  Conversation,
  AutoRelayStage,
  AgentRole,
  Delegations,
} from "../types";
import { listProjects, getCurrentProject, switchProject, addOrOpenProject } from "../services/projects";
import { listConversations } from "../services/conversations";
import { recordAuditEvent } from "../services/history";
import { soundFx } from "../services/soundFx";
import { quotaRadar } from "../services/quotaRadar";
import { autoRelayEngine } from "../services/autoRelay";

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
  toggleAgentEnabled: (appId: GuiAppId) => void;
  setHermesManualRole: (role: AgentRole | null) => void;
  dispatchMissionDelegations: (delegations: Delegations, missionTitle?: string) => void;

  // --- Multi-project ---
  projects: ProjectItem[];
  activeProject: ProjectItem | null;
  projectSwitching: boolean;
  loadProjects: () => Promise<void>;
  switchActiveProject: (projectId: string) => Promise<ProjectItem | null>;
  openProjectFolder: (path: string, name?: string) => Promise<ProjectItem | null>;

  // --- Conversation sessions ---
  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  loadConversations: () => Promise<void>;

  // --- Auto-Relay Pipeline ---
  autoRelayEnabled: boolean;
  autoRelayStage: AutoRelayStage;
  toggleAutoRelay: () => void;
  setAutoRelayStage: (stage: AutoRelayStage) => void;

  // --- Token & Quota Radar ---
  ecoMode: boolean;
  toggleEcoMode: () => void;
  sessionTokens: number;
  recordTokens: (count: number) => void;

  // --- Audio Cues & Mini HUD ---
  audioEnabled: boolean;
  toggleAudio: () => boolean;
  miniHudMode: boolean;
  toggleMiniHud: () => void;

  // --- Mission Blueprints ---
  pendingBlueprintPrompt: string | null;
  setPendingBlueprintPrompt: (prompt: string | null) => void;
}

export function computeHermesAdaptiveState(
  cards: Record<GuiAppId, GuiAgentCardState>,
  manualOverride?: AgentRole | null
): { role: string; taskHint: string; coveringFor?: GuiAppId } {
  if (manualOverride) {
    switch (manualOverride) {
      case "architect":
        return { role: "The Architect (Manual Override)", taskHint: "Perancang arsitektur & RFC teknis" };
      case "coder":
        return { role: "The Coder (Manual Override)", taskHint: "Implementasi kode & isolasi git worktree" };
      case "reviewer":
      case "tester":
        return { role: "The Reviewer (Manual Override)", taskHint: "Audit diff & pengujian keamanan" };
      case "orchestrator":
        return { role: "The Orchestrator (Manual Override)", taskHint: "Koordinasi pipeline delegasi antar-agen" };
      default:
        return { role: "Adaptive Co-Pilot", taskHint: "Asisten komprehensif serbaguna" };
    }
  }

  // Automatic adaptive covering (Vacuum hierarchy):
  // 1. Jika Claude OFF -> Hermes otomatis menjadi Architect
  if (cards.claude && !cards.claude.enabled) {
    return {
      role: "The Architect (Covering Mas Claude)",
      taskHint: "Menggantikan Mas Claude: merancang arsitektur sistem & spesifikasi teknis",
      coveringFor: "claude",
    };
  }
  // 2. Jika Antigravity OFF -> Hermes otomatis menjadi Coder
  if (cards.antigravity && !cards.antigravity.enabled) {
    return {
      role: "The Coder (Covering Mbak Agy)",
      taskHint: "Menggantikan Mbak Agy: eksekusi kode repo & isolasi git worktree",
      coveringFor: "antigravity",
    };
  }
  // 3. Jika ChatGPT OFF -> Hermes otomatis menjadi Reviewer
  if (cards.chatgpt && !cards.chatgpt.enabled) {
    return {
      role: "The Reviewer (Covering Bg Codex)",
      taskHint: "Menggantikan Bg Codex: audit 3-way diff, sanitasi secrets & validasi QA",
      coveringFor: "chatgpt",
    };
  }

  // 4. Jika semua aktif -> Hermes bertindak sebagai Adaptive Co-Pilot (All-Rounder)
  return {
    role: "Adaptive Co-Pilot (All-Rounder)",
    taskHint: "Co-Pilot serbaguna: standby pair-programming, riset docs & optimasi alur kerja",
  };
}

export const useRigStore = create<RigStore>((set) => ({
  pendingBlueprintPrompt: null,
  setPendingBlueprintPrompt: (prompt) => set({ pendingBlueprintPrompt: prompt }),
  agents: [
    {
      id: "agent-arch",
      name: "Lead Architect",
      role: "architect",
      model: "",
      status: "idle",
      tokensUsed: 0,
      currentTaskTitle: "Standby — menunggu arahan arsitektur",
    },
    {
      id: "agent-coder",
      name: "Feature Developer",
      role: "coder",
      model: "",
      status: "idle",
      worktreePath: "",
      tokensUsed: 0,
      currentTaskTitle: "Standby — siap implementasi kode",
    },
    {
      id: "agent-tester",
      name: "QA & Test Engineer",
      role: "tester",
      model: "",
      status: "idle",
      worktreePath: "",
      tokensUsed: 0,
      currentTaskTitle: "Standby — siap eksekusi test suite",
    },
    {
      id: "agent-reviewer",
      name: "Security Reviewer",
      role: "reviewer",
      model: "",
      status: "idle",
      tokensUsed: 0,
      currentTaskTitle: "Standby — siap audit diff & keamanan",
    },
    {
      id: "agent-hermes",
      name: "Hermes Adaptive",
      role: "copilot",
      model: "Hermes 3 / Nous",
      status: "idle",
      tokensUsed: 0,
      currentTaskTitle: "Standby — adaptive AI assistant",
    },
  ],
  tasks: [],
  layoutMode: "split",
  selectedAgentId: "agent-coder",
  activeHitlAction: null,
  telemetry: {
    online: true,
    activeModel: "9Router :20128 (Multi-Model Pool)",
    latencyMs: 38,
    tokensProcessed: 78950,
    endpoint: "http://127.0.0.1:20128/v1",
  },
  selectedDiffTask: null,

  // Multi-project state
  projects: [],
  activeProject: null,
  projectSwitching: false,

  // Conversation session state
  conversations: [],
  activeConversationId: null,

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  loadProjects: async () => {
    const [projects, active] = await Promise.all([listProjects(), getCurrentProject()]);
    set({ projects, activeProject: active });
  },

  switchActiveProject: async (projectId) => {
    set({ projectSwitching: true });
    try {
      const project = await switchProject(projectId);
      set({
        activeProject: project,
        activeConversationId: null,
        conversations: [],
        projectSwitching: false,
      });
      await useRigStore.getState().loadConversations();
      return project;
    } catch (err) {
      console.warn("Gagal pindah project:", err);
      set({ projectSwitching: false });
      return null;
    }
  },

  openProjectFolder: async (path, name) => {
    set({ projectSwitching: true });
    try {
      const project = await addOrOpenProject(path, name);
      set({
        activeProject: project,
        activeConversationId: null,
        conversations: [],
        projectSwitching: false,
      });
      await useRigStore.getState().loadProjects();
      await useRigStore.getState().loadConversations();
      return project;
    } catch (err) {
      console.warn("Gagal membuka folder project:", err);
      set({ projectSwitching: false });
      return null;
    }
  },

  loadConversations: async () => {
    const projectId = useRigStore.getState().activeProject?.id;
    if (!projectId) {
      set({ conversations: [] });
      return;
    }
    const conversations = await listConversations(projectId);
    set({ conversations });
  },

  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setActiveHitlAction: (action) => set({ activeHitlAction: action }),
  setSelectedDiffTask: (task) => set({ selectedDiffTask: task }),

  approveHitlAction: (id) =>
    set((state) => {
      const action = state.activeHitlAction;
      if (action && action.id === id) {
        void recordAuditEvent("user", "HITL_APPROVED", {
          action_id: action.id,
          agent_id: action.agentId,
          agent_name: action.agentName,
          command: action.command,
          risk_level: action.riskLevel,
          description: action.description,
        });
      }
      return { activeHitlAction: null };
    }),

  rejectHitlAction: (id) =>
    set((state) => {
      const action = state.activeHitlAction;
      if (action && action.id === id) {
        void recordAuditEvent("user", "HITL_REJECTED", {
          action_id: action.id,
          agent_id: action.agentId,
          agent_name: action.agentName,
          command: action.command,
          risk_level: action.riskLevel,
          description: action.description,
        });
      }
      return { activeHitlAction: null };
    }),

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
      name: "Mas Claude",
      role: "The Architect",
      model: "Claude Code",
      status: "ready",
      currentTask: "Standby — menunggu arahan arsitektur/RFC untuk tugas berikutnya.",
      artifactOrBranch: "-",
      telemetryNote: "",
      enabled: true,
      manualRoleOverride: null,
    },
    antigravity: {
      appId: "antigravity",
      name: "Mbak Agy",
      role: "The Coder & OS",
      model: "Agent OS",
      status: "ready",
      currentTask: "Standby — repo dan terminal siap untuk instruksi koding.",
      artifactOrBranch: "-",
      telemetryNote: "",
      enabled: true,
      manualRoleOverride: null,
    },
    chatgpt: {
      appId: "chatgpt",
      name: "Bg Codex",
      role: "The Reviewer",
      model: "Security Reviewer",
      status: "ready",
      currentTask: "Standby — siap melakukan review diff dan uji edge-case.",
      artifactOrBranch: "-",
      telemetryNote: "",
      enabled: true,
      manualRoleOverride: null,
    },
    hermes: {
      appId: "hermes",
      name: "Hermes Agent",
      role: "Adaptive Co-Pilot (All-Rounder)",
      model: "Hermes 3 / Nous",
      status: "ready",
      currentTask: "Standby — siap menambal agen nonaktif atau optimasi tugas.",
      artifactOrBranch: "-",
      telemetryNote: "Adaptive Auto-Covering Aktif",
      enabled: true,
      manualRoleOverride: null,
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

  toggleAgentEnabled: (appId: GuiAppId) =>
    set((state) => {
      const current = state.guiCards[appId];
      const nextEnabled = !current.enabled;
      soundFx.playClick();

      const nextCards: Record<GuiAppId, GuiAgentCardState> = {
        ...state.guiCards,
        [appId]: {
          ...current,
          enabled: nextEnabled,
          status: nextEnabled ? "ready" : "disabled",
          telemetryNote: nextEnabled ? "Agen aktif" : "Agen dinonaktifkan (OFF)",
        },
      };

      // Hitung ulang peran adaptif Hermes
      const hermesCard = nextCards.hermes;
      const adaptive = computeHermesAdaptiveState(nextCards, hermesCard.manualRoleOverride);
      nextCards.hermes = {
        ...hermesCard,
        role: adaptive.role,
        currentTask:
          hermesCard.status === "working"
            ? hermesCard.currentTask
            : `[Mode Adaptif]: ${adaptive.taskHint}`,
        telemetryNote: adaptive.coveringFor
          ? `Menambal agen: ${nextCards[adaptive.coveringFor].name}`
          : "Co-Pilot All-Rounder Aktif",
      };

      void recordAuditEvent("user", "AGENT_TOGGLE", {
        app_id: appId,
        enabled: nextEnabled,
        hermes_role: adaptive.role,
      });

      return { guiCards: nextCards };
    }),

  setHermesManualRole: (role: AgentRole | null) =>
    set((state) => {
      soundFx.playClick();
      const adaptive = computeHermesAdaptiveState(state.guiCards, role);
      const nextCards = {
        ...state.guiCards,
        hermes: {
          ...state.guiCards.hermes,
          manualRoleOverride: role,
          role: adaptive.role,
          currentTask: `[Mode Manual]: ${adaptive.taskHint}`,
        },
      };
      return { guiCards: nextCards };
    }),

  autoRelayEnabled: autoRelayEngine.isEnabled(),
  autoRelayStage: autoRelayEngine.getStage(),
  toggleAutoRelay: () =>
    set((state) => {
      const next = !state.autoRelayEnabled;
      autoRelayEngine.setEnabled(next);
      return { autoRelayEnabled: next };
    }),
  setAutoRelayStage: (stage) => {
    autoRelayEngine.setStage(stage);
    set({ autoRelayStage: stage });
  },

  ecoMode: quotaRadar.isEcoMode(),
  toggleEcoMode: () =>
    set((state) => {
      const next = !state.ecoMode;
      quotaRadar.setEcoMode(next);
      return { ecoMode: next };
    }),
  sessionTokens: quotaRadar.getSessionTokens(),
  recordTokens: (count) => {
    quotaRadar.trackTokens(count);
    set({ sessionTokens: quotaRadar.getSessionTokens() });
  },

  audioEnabled: soundFx.isEnabled(),
  toggleAudio: () => {
    const next = soundFx.toggle();
    set({ audioEnabled: next });
    return next;
  },
  miniHudMode: false,
  toggleMiniHud: () => set((state) => ({ miniHudMode: !state.miniHudMode })),

  dispatchMissionDelegations: (delegations, missionTitle) =>
    set((state) => {
      const nextCards = { ...state.guiCards };
      const hermesAdaptive = computeHermesAdaptiveState(nextCards, nextCards.hermes.manualRoleOverride);

      if (delegations.claudeTask) {
        if (nextCards.claude.enabled) {
          nextCards.claude = {
            ...nextCards.claude,
            currentTask: delegations.claudeTask,
            status: "working",
          };
        } else if (nextCards.hermes.enabled && hermesAdaptive.coveringFor === "claude") {
          nextCards.hermes = {
            ...nextCards.hermes,
            currentTask: delegations.claudeTask,
            status: "working",
            telemetryNote: "Menggantikan Mas Claude untuk tugas arsitektur",
          };
        }
      }

      if (delegations.antigravityTask) {
        if (nextCards.antigravity.enabled) {
          nextCards.antigravity = {
            ...nextCards.antigravity,
            currentTask: delegations.antigravityTask,
            status: "working",
          };
        } else if (nextCards.hermes.enabled && hermesAdaptive.coveringFor === "antigravity") {
          nextCards.hermes = {
            ...nextCards.hermes,
            currentTask: delegations.antigravityTask,
            status: "working",
            telemetryNote: "Menggantikan Mbak Agy untuk implementasi kode",
          };
        }
      }

      if (delegations.chatgptTask) {
        if (nextCards.chatgpt.enabled) {
          nextCards.chatgpt = {
            ...nextCards.chatgpt,
            currentTask: delegations.chatgptTask,
            status: "reviewing",
          };
        } else if (nextCards.hermes.enabled && hermesAdaptive.coveringFor === "chatgpt") {
          nextCards.hermes = {
            ...nextCards.hermes,
            currentTask: delegations.chatgptTask,
            status: "reviewing",
            telemetryNote: "Menggantikan Bg Codex untuk audit diff",
          };
        }
      }

      if (delegations.hermesTask && nextCards.hermes.enabled) {
        nextCards.hermes = {
          ...nextCards.hermes,
          currentTask: delegations.hermesTask,
          status: "working",
        };
      }

      soundFx.playMissionDispatched();

      if (state.autoRelayEnabled) {
        autoRelayEngine.startPipeline({
          missionTitle: missionTitle || "Misi Baru",
          claudeTask: delegations.claudeTask,
          antigravityTask: delegations.antigravityTask,
          chatgptTask: delegations.chatgptTask,
        });
        return {
          guiCards: nextCards,
          autoRelayStage: "claude_spec",
        };
      }

      return { guiCards: nextCards };
    }),
}));