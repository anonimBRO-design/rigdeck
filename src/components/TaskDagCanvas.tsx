import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRigStore } from "../store/useRigStore";
import { AgentRole } from "../types";
import {
  Compass,
  Code2,
  FlaskConical,
  ShieldCheck,
  CheckCircle2,
  Pause,
  Play,
  CornerDownLeft,
  MessageSquarePlus,
  Send,
  GitBranch,
  FileCode2,
  Sparkles,
  Workflow,
  X,
  Clock,
} from "lucide-react";

export type DagNodeStatus = "completed" | "in_progress" | "in_review" | "paused" | "pending";

export interface DagNodeDefinition {
  id: string;
  agentId: string;
  role: AgentRole;
  stageLabel: string;
  defaultTitle: string;
  defaultSubtitle: string;
  dependencies: string[];
}

const DAG_NODES_CONFIG: DagNodeDefinition[] = [
  {
    id: "node-arch",
    agentId: "agent-arch",
    role: "architect",
    stageLabel: "Arsitektur",
    defaultTitle: "Lead Architect",
    defaultSubtitle: "Perancangan spesifikasi sistem & dekomposisi task",
    dependencies: [],
  },
  {
    id: "node-coder",
    agentId: "agent-coder",
    role: "coder",
    stageLabel: "Implementasi",
    defaultTitle: "Feature Developer",
    defaultSubtitle: "Pengkodean fitur di isolated worktree",
    dependencies: ["node-arch"],
  },
  {
    id: "node-tester",
    agentId: "agent-tester",
    role: "tester",
    stageLabel: "Pengujian",
    defaultTitle: "QA & Test Engineer",
    defaultSubtitle: "Eksekusi test suite & verifikasi pengujian",
    dependencies: ["node-coder"],
  },
  {
    id: "node-reviewer",
    agentId: "agent-reviewer",
    role: "reviewer",
    stageLabel: "Audit Keamanan",
    defaultTitle: "Security Reviewer",
    defaultSubtitle: "Audit git diff, verifikasi keamanan & merge guard",
    dependencies: ["node-tester"],
  },
  {
    id: "node-hermes",
    agentId: "agent-hermes",
    role: "copilot",
    stageLabel: "Co-Pilot Adaptif",
    defaultTitle: "Hermes Adaptive Engine",
    defaultSubtitle: "Menambal peran agen nonaktif & optimasi tugas sprint",
    dependencies: ["node-arch"],
  },
];

const PRESET_PROMPTS = [
  "Check edge cases for expired JWT refresh tokens",
  "Add mock unit tests for revoked sessions",
  "Audit git diff for accidentally committed secret keys",
  "Verify compatibility with Linux Wayland WebKitGTK",
];

function nodeBranchName(pathOrBranch?: string): string | null {
  if (!pathOrBranch || pathOrBranch === "-" || pathOrBranch === "") return null;
  return pathOrBranch.split("/").pop() || null;
}

export const TaskDagCanvas: React.FC = () => {
  const {
    agents,
    tasks,
    selectedAgentId,
    setSelectedAgentId,
    togglePauseAgent,
    injectReviewPrompt,
    setSelectedDiffTask,
  } = useRigStore();

  const [selectedNodeId, setSelectedNodeId] = useState<string>("node-coder");
  const [showInjectModal, setShowInjectModal] = useState<boolean>(false);
  const [promptInput, setPromptInput] = useState<string>("");
  const [hudMessage, setHudMessage] = useState<{ text: string; type: "info" | "success" | "warn" } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  // Sync selectedNodeId with store selectedAgentId
  useEffect(() => {
    const match = DAG_NODES_CONFIG.find((n) => n.agentId === selectedAgentId);
    if (match && match.id !== selectedNodeId) {
      setSelectedNodeId(match.id);
    }
  }, [selectedAgentId, selectedNodeId]);

  // Toast / HUD temporary banner
  const triggerHud = useCallback((text: string, type: "info" | "success" | "warn" = "info") => {
    setHudMessage({ text, type });
    const timer = setTimeout(() => setHudMessage(null), 3200);
    return () => clearTimeout(timer);
  }, []);

  // Compute status for each DAG Node based on real agents & tasks
  const nodesWithState = useMemo(() => {
    return DAG_NODES_CONFIG.map((config) => {
      const agent = agents.find((a) => a.id === config.agentId);
      const task = tasks.find((t) => t.assignedAgentId === config.agentId);

      let status: DagNodeStatus = "pending";

      if (agent?.status === "paused") {
        status = "paused";
      } else if (task?.status === "done") {
        status = "completed";
      } else if (task?.status === "in_review" || agent?.status === "waiting_approval") {
        status = "in_review";
      } else if (agent?.status === "running" || task?.status === "in_progress") {
        status = "in_progress";
      } else {
        status = "pending";
      }

      const displayTitle = task?.title || agent?.currentTaskTitle || config.defaultTitle;
      const displaySubtitle = task?.description || config.defaultSubtitle;
      const branchOrPath = nodeBranchName(task?.branchName || agent?.worktreePath);

      return {
        ...config,
        agent,
        task,
        status,
        displayTitle,
        displaySubtitle,
        branchOrPath,
      };
    });
  }, [agents, tasks]);

  const activeNode = useMemo(() => {
    return nodesWithState.find((n) => n.id === selectedNodeId) || nodesWithState[1];
  }, [nodesWithState, selectedNodeId]);

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      const target = nodesWithState.find((n) => n.id === nodeId);
      if (target?.agent) {
        setSelectedAgentId(target.agent.id);
        triggerHud(`Switched focus to PTY: ${target.agent.name}`, "info");
      }
    },
    [nodesWithState, setSelectedAgentId, triggerHud]
  );

  const handleTogglePause = useCallback(() => {
    if (!activeNode?.agent) return;
    togglePauseAgent(activeNode.agent.id);
    const willPause = activeNode.agent.status !== "paused";
    triggerHud(
      willPause
        ? `Agent [${activeNode.agent.name}] Paused`
        : `Agent [${activeNode.agent.name}] Resumed Execution`,
      willPause ? "warn" : "success"
    );
  }, [activeNode, togglePauseAgent, triggerHud]);

  const handleOpenInjectModal = useCallback(() => {
    setShowInjectModal(true);
    setTimeout(() => promptInputRef.current?.focus(), 80);
  }, []);

  const handleSendPrompt = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptInput.trim() || !activeNode?.agent) return;

    injectReviewPrompt(activeNode.agent.id, promptInput.trim());
    triggerHud(
      `Review prompt dispatched to ${activeNode.agent.name} via Blackboard!`,
      "success"
    );
    setPromptInput("");
    setShowInjectModal(false);
  };

  // Keyboard shortcut listener: [Space] to pause/resume, [Enter] to inject prompt, Arrow keys to navigate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        if (e.key === "Escape" && showInjectModal) {
          setShowInjectModal(false);
        }
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePause();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleOpenInjectModal();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const currentIndex = nodesWithState.findIndex((n) => n.id === selectedNodeId);
        const nextIndex = (currentIndex + 1) % nodesWithState.length;
        handleSelectNode(nodesWithState[nextIndex].id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = nodesWithState.findIndex((n) => n.id === selectedNodeId);
        const prevIndex = (currentIndex - 1 + nodesWithState.length) % nodesWithState.length;
        handleSelectNode(nodesWithState[prevIndex].id);
      } else if (e.key === "Escape") {
        if (showInjectModal) {
          setShowInjectModal(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showInjectModal,
    handleTogglePause,
    handleOpenInjectModal,
    handleSelectNode,
    nodesWithState,
    selectedNodeId,
  ]);

  // Visual helper for Role Icon
  const getRoleIcon = (role: AgentRole) => {
    switch (role) {
      case "architect":
        return <Compass size={15} className="text-indigo-400" />;
      case "coder":
        return <Code2 size={15} className="text-sky-400" />;
      case "tester":
        return <FlaskConical size={15} className="text-amber-400" />;
      case "reviewer":
        return <ShieldCheck size={15} className="text-emerald-400" />;
      case "copilot":
        return <Workflow size={15} className="text-purple-400" />;
      case "orchestrator":
        return <Sparkles size={15} className="text-pink-400" />;
    }
  };

  // Node card styles according to status (flat, matte dark)
  const getNodeGlowClass = (status: DagNodeStatus, isSelected: boolean) => {
    const selectionBorder = isSelected
      ? "ring-1 ring-rig-accent border-rig-accent"
      : "hover:border-[#383838]";

    switch (status) {
      case "completed":
        return `border-[#2e3b2e] bg-[#181818] ${selectionBorder}`;
      case "in_progress":
        return `border-[#1e3448] bg-[#181818] ${selectionBorder}`;
      case "in_review":
        return `border-[#3e3422] bg-[#181818] ${selectionBorder}`;
      case "paused":
        return `border-[#33253b] bg-[#181818] ${selectionBorder}`;
      case "pending":
      default:
        return `border-[#282828] bg-[#151515] opacity-75 ${selectionBorder}`;
    }
  };

  const getStatusBadge = (status: DagNodeStatus) => {
    switch (status) {
      case "completed":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#1e2a20] text-[#4ec9b0] border border-[#2e3b2e]">
            <CheckCircle2 size={11} />
            Completed
          </span>
        );
      case "in_progress":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#1a2634] text-[#569cd6] border border-[#23384c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#569cd6] inline-block" />
            In Progress
          </span>
        );
      case "in_review":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#2e2619] text-[#ce9178] border border-[#3e3422]">
            <Sparkles size={11} className="text-[#ce9178]" />
            Reviewing
          </span>
        );
      case "paused":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#261f2e] text-[#c4b5fd] border border-[#382b45]">
            <Pause size={10} />
            Paused
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#1e1e1e] text-[#888888] border border-[#282828]">
            <Clock size={10} />
            Standby
          </span>
        );
    }
  };

  const getRoleBadge = (role: AgentRole) => {
    switch (role) {
      case "architect":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border bg-[#1c1a24] text-[#c4b5fd] border-[#342e48]">
            Architect
          </span>
        );
      case "coder":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border bg-[#14232f] text-[#7dd3fc] border-[#1e3a52]">
            Developer
          </span>
        );
      case "tester":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border bg-[#251e18] text-[#fcd34d] border-[#443628]">
            QA / Test
          </span>
        );
      case "reviewer":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border bg-[#16221c] text-[#6ee7b7] border-[#243d32]">
            Security
          </span>
        );
      case "copilot":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border bg-[#271b38] text-[#d8b4fe] border-[#522b7a]">
            Co-Pilot
          </span>
        );
      case "orchestrator":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border bg-[#2a1d30] text-[#f472b6] border-[#50245d]">
            Orchestrator
          </span>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full bg-[#121212] border border-rig-border rounded-lg overflow-hidden relative select-none"
    >
      {/* HUD Toast Bar */}
      {hudMessage && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded text-xs font-mono flex items-center gap-2 border shadow-lg ${
            hudMessage.type === "success"
              ? "bg-[#181818] text-[#4ec9b0] border-[#2e3b2e]"
              : hudMessage.type === "warn"
              ? "bg-[#181818] text-[#ce9178] border-[#3e3422]"
              : "bg-[#181818] text-[#569cd6] border-[#1e3448]"
          }`}
        >
          <Sparkles size={13} className="text-rig-accent" />
          <span>{hudMessage.text}</span>
        </div>
      )}

      {/* DAG Header & Operator Toolbar */}
      <div className="h-10 px-4 bg-[#161616] border-b border-rig-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded bg-[#202020] border border-[#2e2e2e] flex items-center justify-center">
            <Workflow size={13} className="text-rig-accent" />
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#cccccc] flex items-center gap-2">
              Autonomous Task DAG Flow
              <span className="text-[10px] font-mono normal-case px-1.5 py-0.5 rounded bg-[#222222] text-[#888888] border border-[#2c2c2c]">
                Blackboard v1.1
              </span>
            </h3>
          </div>
        </div>

        {/* Quick Keyboard Action Bar */}
        <div className="flex items-center gap-2">
          {/* Pause / Resume Button */}
          <button
            onClick={handleTogglePause}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all ${
              activeNode?.agent?.status === "paused"
                ? "bg-[#1e2a20] border-[#2e3b2e] text-[#4ec9b0] hover:bg-[#253528]"
                : "bg-[#202020] border-[#2e2e2e] text-[#cccccc] hover:bg-[#282828]"
            }`}
            title="Press [Space] to pause or resume agent"
          >
            {activeNode?.agent?.status === "paused" ? (
              <Play size={12} className="text-[#4ec9b0]" />
            ) : (
              <Pause size={12} className="text-[#ce9178]" />
            )}
            <span>{activeNode?.agent?.status === "paused" ? "Resume" : "Pause"}</span>
            <kbd className="text-[9px] bg-[#161616] px-1 py-0.2 rounded border border-[#2c2c2c] text-[#777777] font-mono">
              Space
            </kbd>
          </button>

          {/* Inject Review Prompt Button */}
          <button
            onClick={handleOpenInjectModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-[#007acc]/15 border border-[#007acc]/40 text-[#569cd6] hover:bg-[#007acc]/25 transition-all"
            title="Press [Enter] to inject review prompt"
          >
            <MessageSquarePlus size={12} className="text-rig-accent" />
            <span>Inject Review</span>
            <kbd className="text-[9px] bg-[#161616] px-1 py-0.2 rounded border border-[#2c2c2c] text-[#777777] font-mono flex items-center gap-0.5">
              <CornerDownLeft size={9} />
              Enter
            </kbd>
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 relative flex items-center justify-center min-h-[260px]">
        {/* SVG Connectors Layer */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          style={{ overflow: "visible" }}
        >
          <defs>
            {/* Arrowhead marker for edges */}
            <marker
              id="dag-arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#444444" />
            </marker>
          </defs>

          {/* SVG Connection Lines between sequential Nodes */}
          {/* Node 1 -> Node 2 */}
          <g>
            <path
              d="M 230 135 C 265 135, 275 135, 310 135"
              fill="none"
              stroke="#383838"
              strokeWidth="2"
              markerEnd="url(#dag-arrow)"
            />
            {/* Artifact Pill on Edge */}
            <rect x="245" y="112" width="62" height="18" rx="3" fill="#181818" stroke="#282828" />
            <text x="276" y="124" fill="#888888" fontSize="9" fontFamily="monospace" textAnchor="middle">
              spec.json
            </text>
          </g>

          {/* Node 2 -> Node 3 */}
          <g>
            <path
              d="M 540 135 C 575 135, 585 135, 620 135"
              fill="none"
              stroke="#383838"
              strokeWidth="2"
              markerEnd="url(#dag-arrow)"
            />
            <rect x="555" y="112" width="64" height="18" rx="3" fill="#181818" stroke="#282828" />
            <text x="587" y="124" fill="#888888" fontSize="9" fontFamily="monospace" textAnchor="middle">
              git diff
            </text>
          </g>

          {/* Node 3 -> Node 4 */}
          <g>
            <path
              d="M 850 135 C 885 135, 895 135, 930 135"
              fill="none"
              stroke="#383838"
              strokeWidth="2"
              markerEnd="url(#dag-arrow)"
            />
            <rect x="865" y="112" width="68" height="18" rx="3" fill="#181818" stroke="#282828" />
            <text x="899" y="124" fill="#888888" fontSize="9" fontFamily="monospace" textAnchor="middle">
              test-pass
            </text>
          </g>
        </svg>

        {/* Nodes Grid Wrapper */}
        <div className="flex items-center gap-20 relative z-10 py-4 px-2">
          {nodesWithState.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const glowClass = getNodeGlowClass(node.status, isSelected);

            return (
              <div
                key={node.id}
                onClick={() => handleSelectNode(node.id)}
                className={`w-64 rounded-lg border p-3.5 transition-all duration-150 cursor-pointer flex flex-col justify-between relative ${glowClass}`}
              >
                {/* Node Top: Role Icon, Title & Model Badge */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="p-1 rounded bg-[#202020] border border-[#2e2e2e]">
                        {getRoleIcon(node.role)}
                      </div>
                      <span className="text-[11px] font-semibold text-[#cccccc] tracking-wide uppercase">
                        {node.agent?.name || node.role}
                      </span>
                    </div>

                    {/* Role Badge (No hardcoded fake models) */}
                    {getRoleBadge(node.role)}
                  </div>

                  <h4 className="text-xs font-semibold text-[#f3f3f3] line-clamp-1 group-hover:text-rig-accent">
                    {node.displayTitle}
                  </h4>
                  <p className="text-[11px] text-[#888888] mt-1 line-clamp-2 leading-relaxed">
                    {node.displaySubtitle}
                  </p>
                </div>

                {/* Node Bottom: Status Pill, Branch/Artifact & Focus Button */}
                <div className="mt-3.5 pt-2.5 border-t border-[#282828] flex items-center justify-between">
                  {getStatusBadge(node.status)}

                  {node.branchOrPath ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (node.task) setSelectedDiffTask(node.task);
                      }}
                      className="text-[10px] font-mono text-[#888888] hover:text-[#569cd6] flex items-center gap-1 bg-[#202020] px-1.5 py-0.5 rounded border border-[#2e2e2e] transition-colors"
                      title="Inspect Git Diff"
                    >
                      <GitBranch size={10} className="text-rig-accent" />
                      <span>{node.branchOrPath}</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-[#666666] flex items-center gap-1">
                      <FileCode2 size={10} />
                      <span>{node.stageLabel}</span>
                    </span>
                  )}
                </div>

                {/* Selected Indicator Pill */}
                {isSelected && (
                  <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-rig-accent text-white font-medium text-[9px] px-2 py-0.5 rounded uppercase tracking-wider">
                    Focused Agent
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Mission Control Footer & Shortcut Hint Legend */}
      <div className="h-9 px-4 bg-[#161616] border-t border-rig-border flex items-center justify-between text-[11px] text-[#888888] font-mono">
        <div className="flex items-center gap-3">
          <span className="text-[#cccccc] font-medium flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#4ec9b0]" />
            Active Agent:{" "}
            <span className="text-[#569cd6]">{activeNode?.agent?.name || "None"}</span>
          </span>
          <span className="text-[#444444]">|</span>
          <span className="hidden sm:inline">
            Status: <span className="text-[#cccccc] uppercase">{activeNode?.status}</span>
          </span>
        </div>

        {/* Keyboard Legend */}
        <div className="flex items-center gap-3 text-[10px] text-[#888888]">
          <span className="flex items-center gap-1">
            <kbd className="bg-[#202020] border border-[#2e2e2e] px-1.5 py-0.5 rounded text-[#cccccc]">
              Click
            </kbd>
            <span>Focus PTY</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-[#202020] border border-[#2e2e2e] px-1.5 py-0.5 rounded text-[#cccccc]">
              Space
            </kbd>
            <span>Pause/Resume</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-[#202020] border border-[#2e2e2e] px-1.5 py-0.5 rounded text-[#cccccc]">
              Enter
            </kbd>
            <span>Inject Prompt</span>
          </span>
          <span className="flex items-center gap-1 hidden md:flex">
            <kbd className="bg-[#202020] border border-[#2e2e2e] px-1.5 py-0.5 rounded text-[#cccccc]">
              ← / →
            </kbd>
            <span>Navigate DAG</span>
          </span>
        </div>
      </div>

      {/* Modal: Inject Review Prompt */}
      {showInjectModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#181818] border border-[#282828] rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <MessageSquarePlus size={16} className="text-rig-accent" />
                  <h3 className="text-sm font-semibold text-[#f3f3f3]">
                    Inject Review Prompt to {activeNode?.agent?.name}
                  </h3>
                </div>
                <p className="text-xs text-[#888888] mt-1">
                  Intervene directly into this agent&apos;s active turn via the 9Router & Blackboard.
                </p>
              </div>
              <button
                onClick={() => setShowInjectModal(false)}
                className="text-[#888888] hover:text-[#f3f3f3] p-1 rounded hover:bg-[#252525] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Target Agent Context Info */}
            <div className="p-2.5 rounded bg-[#202020] border border-[#2e2e2e] flex items-center justify-between text-xs font-mono">
              <span className="text-[#888888]">
                Model: <span className="text-[#569cd6]">{activeNode?.agent?.model}</span>
              </span>
              <span className="text-[#888888]">
                Role: <span className="text-[#c4b5fd] uppercase">{activeNode?.role}</span>
              </span>
              <span className="text-[#888888]">
                Worktree:{" "}
                <span className="text-[#fcd34d]">
                  {activeNode?.agent?.worktreePath?.split("/").pop() || "main"}
                </span>
              </span>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendPrompt} className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-[#cccccc] block mb-1">
                  Instruction / Code Review Feedback
                </label>
                <div className="relative">
                  <input
                    ref={promptInputRef}
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder="e.g. Verify token expiry claims and sanitize payload before decoding..."
                    className="w-full bg-[#121212] border border-[#333333] rounded pl-3 pr-10 py-2 text-xs text-[#f3f3f3] placeholder:text-[#666666] focus:outline-none focus:border-rig-accent"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!promptInput.trim()}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded bg-rig-accent hover:bg-rig-accentHover disabled:opacity-40 text-white transition-all"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>

              {/* Quick Preset Prompts */}
              <div>
                <span className="text-[10px] font-mono text-[#777777] uppercase tracking-wider block mb-1.5">
                  Quick Review Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_PROMPTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPromptInput(preset)}
                      className="text-[10px] bg-[#202020] hover:bg-[#282828] text-[#cccccc] border border-[#2e2e2e] hover:border-[#383838] px-2 py-1 rounded transition-colors text-left"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#282828]">
                <button
                  type="button"
                  onClick={() => setShowInjectModal(false)}
                  className="px-3 py-1.5 rounded text-xs font-medium text-[#888888] hover:bg-[#252525] border border-[#2e2e2e] transition-colors"
                >
                  Cancel (Esc)
                </button>
                <button
                  type="submit"
                  disabled={!promptInput.trim()}
                  className="px-4 py-1.5 rounded text-xs font-medium bg-rig-accent hover:bg-rig-accentHover disabled:opacity-40 text-white flex items-center gap-1.5 transition-all"
                >
                  <Send size={12} />
                  <span>Dispatch & Continue Turn</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDagCanvas;
