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
  Cpu,
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
  title: string;
  subtitle: string;
  modelBadge: string;
  modelFamily: "anthropic" | "google" | "openai";
  artifactOutput: string;
  dependencies: string[];
}

const DAG_NODES_CONFIG: DagNodeDefinition[] = [
  {
    id: "node-arch",
    agentId: "agent-arch",
    role: "architect",
    title: "Design Spec & Task Decomposition",
    subtitle: "Define architecture contracts & Blackboard SQLite schema",
    modelBadge: "Opus 5.5",
    modelFamily: "anthropic",
    artifactOutput: "spec.json (v1.1)",
    dependencies: [],
  },
  {
    id: "node-coder",
    agentId: "agent-coder",
    role: "coder",
    title: "Scaffold Auth & JWT Handlers",
    subtitle: "Implement JWT session validation & cookie middleware",
    modelBadge: "Sonnet 4.6",
    modelFamily: "anthropic",
    artifactOutput: "rig/feat-auth (4 files)",
    dependencies: ["node-arch"],
  },
  {
    id: "node-tester",
    agentId: "agent-tester",
    role: "tester",
    title: "Run Vitest & Endpoint Tests",
    subtitle: "Execute regression suite for auth claims and expiration",
    modelBadge: "Gemini 3.5",
    modelFamily: "google",
    artifactOutput: "vitest-report.xml",
    dependencies: ["node-coder"],
  },
  {
    id: "node-reviewer",
    agentId: "agent-reviewer",
    role: "reviewer",
    title: "Audit Diff & Token Leak Check",
    subtitle: "Verify security boundaries and evaluate git diff for merge",
    modelBadge: "Opus 5.5",
    modelFamily: "anthropic",
    artifactOutput: "audit-verdict.md",
    dependencies: ["node-tester"],
  },
];

const PRESET_PROMPTS = [
  "Check edge cases for expired JWT refresh tokens",
  "Add mock unit tests for revoked sessions",
  "Audit git diff for accidentally committed secret keys",
  "Verify compatibility with Linux Wayland WebKitGTK",
];

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

  // Compute status for each DAG Node based on agent & tasks
  const nodesWithState = useMemo(() => {
    return DAG_NODES_CONFIG.map((config) => {
      const agent = agents.find((a) => a.id === config.agentId);
      const task = tasks.find((t) => t.assignedAgentId === config.agentId);

      let status: DagNodeStatus = "pending";

      if (agent?.status === "paused") {
        status = "paused";
      } else if (task?.status === "done" || agent?.status === "completed") {
        status = "completed";
      } else if (task?.status === "in_review" || agent?.status === "waiting_approval") {
        status = "in_review";
      } else if (agent?.status === "running" || task?.status === "in_progress") {
        status = "in_progress";
      } else if (agent?.status === "idle") {
        status = "completed";
      }

      return {
        ...config,
        agent,
        task,
        status,
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
    }
  };

  // Node glowing styles according to status
  const getNodeGlowClass = (status: DagNodeStatus, isSelected: boolean) => {
    const selectionRing = isSelected
      ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0b0f17] scale-[1.02]"
      : "hover:scale-[1.01]";

    switch (status) {
      case "completed":
        return `border-emerald-500/50 bg-gradient-to-b from-emerald-950/30 via-slate-900/90 to-slate-900/95 shadow-[0_0_22px_rgba(16,185,129,0.22)] ${selectionRing}`;
      case "in_progress":
        return `border-blue-500/60 bg-gradient-to-b from-blue-950/30 via-slate-900/90 to-slate-900/95 shadow-[0_0_24px_rgba(59,130,246,0.3)] ${selectionRing}`;
      case "in_review":
        return `border-amber-500/60 bg-gradient-to-b from-amber-950/35 via-slate-900/90 to-slate-900/95 shadow-[0_0_24px_rgba(245,158,11,0.32)] ${selectionRing}`;
      case "paused":
        return `border-purple-500/50 bg-gradient-to-b from-purple-950/30 via-slate-900/90 to-slate-900/95 shadow-[0_0_20px_rgba(168,85,247,0.25)] ${selectionRing}`;
      case "pending":
      default:
        return `border-slate-800 bg-slate-900/70 opacity-80 ${selectionRing}`;
    }
  };

  const getStatusBadge = (status: DagNodeStatus) => {
    switch (status) {
      case "completed":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={11} />
            Completed
          </span>
        );
      case "in_progress":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/40">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping inline-block" />
            In Progress
          </span>
        );
      case "in_review":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40">
            <Sparkles size={11} className="animate-spin text-amber-300" />
            Reviewing
          </span>
        );
      case "paused":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/40">
            <Pause size={10} />
            Paused
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            <Clock size={10} />
            Standby
          </span>
        );
    }
  };

  const getModelBadge = (modelBadge: string, family: "anthropic" | "google" | "openai") => {
    let colorStyle = "";
    if (family === "anthropic") {
      colorStyle = "bg-indigo-950/60 text-indigo-300 border-indigo-500/40";
    } else if (family === "google") {
      colorStyle = "bg-amber-950/60 text-amber-300 border-amber-500/40";
    } else {
      colorStyle = "bg-emerald-950/60 text-emerald-300 border-emerald-500/40";
    }

    return (
      <span
        className={`flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border shadow-sm ${colorStyle}`}
      >
        <Cpu size={10} />
        {modelBadge}
      </span>
    );
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full bg-[#080c14] border border-rig-border/80 rounded-xl overflow-hidden relative select-none"
    >
      {/* HUD Toast Bar */}
      {hudMessage && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 backdrop-blur-md shadow-2xl transition-all duration-200 border ${
            hudMessage.type === "success"
              ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/50 shadow-emerald-500/20"
              : hudMessage.type === "warn"
              ? "bg-amber-950/90 text-amber-200 border-amber-500/50 shadow-amber-500/20"
              : "bg-blue-950/90 text-blue-200 border-blue-500/50 shadow-blue-500/20"
          }`}
        >
          <Sparkles size={13} className="text-cyan-400" />
          <span>{hudMessage.text}</span>
        </div>
      )}

      {/* DAG Header & Operator Toolbar */}
      <div className="h-11 px-4 bg-slate-900/80 border-b border-rig-border flex items-center justify-between backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-md bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <Workflow size={14} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              Autonomous Task DAG Flow
              <span className="text-[10px] font-mono normal-case px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
              activeNode?.agent?.status === "paused"
                ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600 hover:text-white"
                : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300"
            }`}
            title="Press [Space] to pause or resume agent"
          >
            {activeNode?.agent?.status === "paused" ? (
              <Play size={12} className="text-emerald-400" />
            ) : (
              <Pause size={12} className="text-amber-400" />
            )}
            <span>{activeNode?.agent?.status === "paused" ? "Resume" : "Pause"}</span>
            <kbd className="text-[9px] bg-slate-900 px-1 py-0.2 rounded border border-slate-700 text-slate-400 font-mono">
              Space
            </kbd>
          </button>

          {/* Inject Review Prompt Button */}
          <button
            onClick={handleOpenInjectModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
            title="Press [Enter] to inject review prompt"
          >
            <MessageSquarePlus size={12} className="text-blue-400" />
            <span>Inject Review</span>
            <kbd className="text-[9px] bg-slate-900 px-1 py-0.2 rounded border border-slate-700 text-slate-400 font-mono flex items-center gap-0.5">
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
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#38bdf8" />
            </marker>

            <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#818cf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0.8" />
            </linearGradient>

            <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* SVG Connection Lines between sequential Nodes */}
          {/* Node 1 -> Node 2 */}
          <g>
            <path
              d="M 230 135 C 265 135, 275 135, 310 135"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              className="animate-dash"
              markerEnd="url(#dag-arrow)"
            />
            {/* Artifact Pill on Edge */}
            <rect x="245" y="112" width="62" height="18" rx="4" fill="#0f172a" stroke="#334155" />
            <text x="276" y="124" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">
              spec.json
            </text>
          </g>

          {/* Node 2 -> Node 3 */}
          <g>
            <path
              d="M 540 135 C 575 135, 585 135, 620 135"
              fill="none"
              stroke="#818cf8"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              className="animate-dash"
              markerEnd="url(#dag-arrow)"
            />
            <rect x="555" y="112" width="64" height="18" rx="4" fill="#0f172a" stroke="#334155" />
            <text x="587" y="124" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">
              git diff
            </text>
          </g>

          {/* Node 3 -> Node 4 */}
          <g>
            <path
              d="M 850 135 C 885 135, 895 135, 930 135"
              fill="none"
              stroke="#34d399"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              className="animate-dash"
              markerEnd="url(#dag-arrow)"
            />
            <rect x="865" y="112" width="68" height="18" rx="4" fill="#0f172a" stroke="#334155" />
            <text x="899" y="124" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">
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
                className={`w-64 rounded-xl border p-3.5 transition-all duration-200 cursor-pointer flex flex-col justify-between relative backdrop-blur-md ${glowClass}`}
              >
                {/* Node Top: Role Icon, Title & Model Badge */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="p-1 rounded bg-slate-800/80 border border-slate-700/50">
                        {getRoleIcon(node.role)}
                      </div>
                      <span className="text-[11px] font-semibold text-slate-300 tracking-wide uppercase">
                        {node.agent?.name || node.role}
                      </span>
                    </div>

                    {/* LLM Model Mini-Badge */}
                    {getModelBadge(node.modelBadge, node.modelFamily)}
                  </div>

                  <h4 className="text-xs font-bold text-slate-100 line-clamp-1 group-hover:text-blue-400">
                    {node.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {node.subtitle}
                  </p>
                </div>

                {/* Node Bottom: Status Pill, Branch/Artifact & Focus Button */}
                <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  {getStatusBadge(node.status)}

                  {node.task?.branchName ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (node.task) setSelectedDiffTask(node.task);
                      }}
                      className="text-[10px] font-mono text-slate-400 hover:text-blue-400 flex items-center gap-1 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/40 transition-colors"
                      title="Inspect Git Diff"
                    >
                      <GitBranch size={10} className="text-blue-400" />
                      <span>{node.task.branchName.split("/").pop()}</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                      <FileCode2 size={10} />
                      {node.artifactOutput}
                    </span>
                  )}
                </div>

                {/* Selected Indicator Pill */}
                {isSelected && (
                  <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-cyan-500 text-slate-950 font-bold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-md shadow-cyan-500/30">
                    Focused Agent
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Mission Control Footer & Shortcut Hint Legend */}
      <div className="h-9 px-4 bg-slate-950/80 border-t border-rig-border flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Active Agent:{" "}
            <span className="text-cyan-400">{activeNode?.agent?.name || "None"}</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="hidden sm:inline">
            Status: <span className="text-slate-300 uppercase">{activeNode?.status}</span>
          </span>
        </div>

        {/* Keyboard Legend */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
              Click
            </kbd>
            <span>Focus PTY</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
              Space
            </kbd>
            <span>Pause/Resume</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
              Enter
            </kbd>
            <span>Inject Prompt</span>
          </span>
          <span className="flex items-center gap-1 hidden md:flex">
            <kbd className="bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
              ← / →
            </kbd>
            <span>Navigate DAG</span>
          </span>
        </div>
      </div>

      {/* Modal: Inject Review Prompt */}
      {showInjectModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0e1420] border border-blue-500/40 rounded-2xl p-5 shadow-2xl shadow-blue-500/10 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <MessageSquarePlus size={16} className="text-blue-400" />
                  <h3 className="text-sm font-bold text-slate-100">
                    Inject Review Prompt to {activeNode?.agent?.name}
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Intervene directly into this agent&apos;s active turn via the 9Router & Blackboard.
                </p>
              </div>
              <button
                onClick={() => setShowInjectModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Target Agent Context Info */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">
                Model: <span className="text-blue-400">{activeNode?.agent?.model}</span>
              </span>
              <span className="text-slate-400">
                Role: <span className="text-indigo-400 uppercase">{activeNode?.role}</span>
              </span>
              <span className="text-slate-400">
                Worktree:{" "}
                <span className="text-amber-400">
                  {activeNode?.agent?.worktreePath?.split("/").pop() || "main"}
                </span>
              </span>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendPrompt} className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">
                  Instruction / Code Review Feedback
                </label>
                <div className="relative">
                  <input
                    ref={promptInputRef}
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder="e.g. Verify token expiry claims and sanitize payload before decoding..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!promptInput.trim()}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-all"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>

              {/* Quick Preset Prompts */}
              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
                  Quick Review Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_PROMPTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPromptInput(preset)}
                      className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 px-2 py-1 rounded transition-colors text-left"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowInjectModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancel (Esc)
                </button>
                <button
                  type="submit"
                  disabled={!promptInput.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all"
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
