import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRigStore } from "../store/useRigStore";
import { Agent } from "../types";
import {
  Terminal as TermIcon,
  Pause,
  AlertTriangle,
  FolderGit2,
  RotateCcw,
  Wrench,
  ShieldAlert,
  X,
} from "lucide-react";
import { selfHealingWatcher, SelfHealingAlert } from "../services/selfHealing";
import { soundFx } from "../services/soundFx";
import { namaOS } from "../lib/platform";

interface AgentTerminalCardProps {
  agent: Agent;
}

interface PtyOutputPayload {
  agent_id: string;
  data: string;
}

const AgentTerminalCard: React.FC<AgentTerminalCardProps> = ({ agent }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js instance
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#121212",
        foreground: "#cccccc",
        cursor: "#007acc",
        selectionBackground: "#264f78",
        black: "#1e1e1e",
        red: "#f87171",
        green: "#4ec9b0",
        yellow: "#dcdcaa",
        blue: "#569cd6",
        magenta: "#c586c0",
        cyan: "#4fc1ff",
        white: "#f3f3f3",
      },
      fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.3,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);

    const safeFit = () => {
      try {
        if (
          terminalRef.current &&
          terminalRef.current.clientWidth > 0 &&
          terminalRef.current.clientHeight > 0
        ) {
          fitAddon.fit();
        }
      } catch {
        // Ignored if DOM not yet fully painted
      }
    };

    // Use fast native DOM renderer (WebGL in WebKitGTK Wayland causes severe GPU readback lag)
    requestAnimationFrame(() => {
      safeFit();
    });
    const fitTimer = setTimeout(safeFit, 100);

    termInstanceRef.current = term;

    // Connect to REAL native PTY via Tauri IPC
    let isMounted = true;
    let unlistenOutput: (() => void) | null = null;

    const initPty = async () => {
      try {
        // 1. Spawn native PTY session for this agent
        await invoke("spawn_pty", {
          agentId: agent.id,
          cmd: "bash",
          args: ["-i"],
          cwd: agent.worktreePath || null,
          rows: term.rows || 24,
          cols: term.cols || 80,
        });

        // 2. Listen for asynchronous output stream from backend
        unlistenOutput = await listen<PtyOutputPayload>("pty-output", (event) => {
          if (!isMounted) return;
          if (event.payload.agent_id === agent.id) {
            term.write(event.payload.data);
            // Defer error analysis so terminal rendering and keystrokes stay 60fps instant
            const chunk = event.payload.data;
            setTimeout(() => {
              selfHealingWatcher.inspectTerminalStream(agent.id, chunk);
            }, 60);
          }
        });

        // Initial info banner in terminal
        term.writeln(`\x1b[38;5;39m[RigDeck PTY Terminal: ${agent.name} (${agent.id})]\x1b[0m`);
        term.writeln(`\x1b[90mRole: ${agent.role.toUpperCase()} | ${namaOS} PTY Terminal Ready\x1b[0m`);
        term.writeln(`\x1b[90m--------------------------------------------------\x1b[0m`);
      } catch (err) {
        term.writeln(`\x1b[31m[PTY Error]: Failed to attach session: ${err}\x1b[0m`);
      }
    };

    initPty();

    // 3. Forward interactive user keyboard input directly to stdin
    const onDataDispose = term.onData((data) => {
      invoke("write_pty", { agentId: agent.id, data }).catch(() => {});
    });

    // 4. Resize listener
    const handleResize = () => {
      safeFit();
      invoke("resize_pty", {
        agentId: agent.id,
        rows: term.rows,
        cols: term.cols,
      }).catch(() => {});
    };

    window.addEventListener("resize", handleResize);

    return () => {
      isMounted = false;
      clearTimeout(fitTimer);
      onDataDispose.dispose();
      window.removeEventListener("resize", handleResize);
      if (unlistenOutput) unlistenOutput();
      invoke("kill_pty", { agentId: agent.id }).catch(() => {});
      term.dispose();
    };
  }, [agent]);

  const handleRestartPty = () => {
    if (!termInstanceRef.current) return;
    invoke("kill_pty", { agentId: agent.id }).then(() => {
      termInstanceRef.current?.clear();
      invoke("spawn_pty", {
        agentId: agent.id,
        cmd: "bash",
        args: ["-i"],
        cwd: agent.worktreePath || null,
        rows: termInstanceRef.current?.rows || 24,
        cols: termInstanceRef.current?.cols || 80,
      });
    });
  };

  const statusColor =
    agent.status === "running"
      ? "text-[#4ec9b0] bg-[#1e2a20] border-[#2e3b2e]"
      : agent.status === "waiting_approval"
      ? "text-[#ce9178] bg-[#251e18] border-[#3e3422]"
      : "text-[#888888] bg-[#202020] border-[#2e2e2e]";

  return (
    <div className="flex flex-col h-full bg-[#121212] rounded-lg border border-[#282828] overflow-hidden">
      {/* Terminal Title Bar */}
      <div className="h-8 bg-[#181818] px-3 flex items-center justify-between border-b border-[#282828]">
        <div className="flex items-center gap-2">
          <TermIcon size={14} className="text-rig-accent" />
          <span className="text-xs font-medium text-[#f3f3f3]">{agent.name}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${statusColor}`}>
            {agent.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {agent.worktreePath && (
            <span className="text-[10px] font-mono text-[#888888] flex items-center gap-1 bg-[#202020] px-2 py-0.5 rounded border border-[#2e2e2e]">
              <FolderGit2 size={11} className="text-[#ce9178]" />
              {agent.worktreePath.split("/").pop()}
            </span>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={handleRestartPty}
              title="Restart PTY"
              className="p-1 rounded hover:bg-[#252525] text-[#888888] hover:text-[#cccccc] transition-colors"
            >
              <RotateCcw size={12} />
            </button>
            <button
              title="Pause Agent"
              className="p-1 rounded hover:bg-[#252525] text-[#888888] hover:text-[#cccccc] transition-colors"
            >
              <Pause size={12} />
            </button>
            <button
              title="Kill Process"
              onClick={() => invoke("kill_pty", { agentId: agent.id })}
              className="p-1 rounded hover:bg-[#3a1a1a] text-[#888888] hover:text-[#f87171] transition-colors"
            >
              <AlertTriangle size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* xterm.js Canvas Container */}
      <div ref={terminalRef} className="flex-1 w-full p-2 overflow-hidden" />
    </div>
  );
};

export const TerminalGrid: React.FC = () => {
  const { agents, layoutMode, setLayoutMode, selectedAgentId, setSelectedAgentId } = useRigStore();
  const [activeAlert, setActiveAlert] = React.useState<SelfHealingAlert | null>(null);
  const [selfHealingEnabled, setSelfHealingEnabled] = React.useState(() => selfHealingWatcher.isEnabled());

  React.useEffect(() => {
    return selfHealingWatcher.subscribe((al) => setActiveAlert(al));
  }, []);

  const handleToggleSelfHealing = () => {
    soundFx.playClick();
    const next = selfHealingWatcher.toggle();
    setSelfHealingEnabled(next);
  };

  const handleAutoFix = (alert: SelfHealingAlert) => {
    soundFx.playBuildSuccess();
    const fixPrompt = `echo -e "\\n\\033[33m[Self-Healing Autopilot]: Menganalisis error: ${alert.title}\\033[0m"\\n`;
    invoke("write_pty", { agentId: alert.agentId, data: fixPrompt }).catch(() => {});
    selfHealingWatcher.clearAlert();
  };

  let displayedAgents: Agent[] = [];
  let gridClass = "";

  if (layoutMode === "focus") {
    const matched = agents.find((a) => a.id === selectedAgentId) || agents[1] || agents[0];
    displayedAgents = matched ? [matched] : [];
    gridClass = "grid-cols-1";
  } else if (layoutMode === "split") {
    displayedAgents = agents.slice(1, 3); // Coder + Tester
    gridClass = "grid-cols-1 md:grid-cols-2";
  } else {
    displayedAgents = agents.slice(0, 4); // All 4
    gridClass = "grid-cols-1 sm:grid-cols-2 grid-rows-2";
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#121212] select-none">
      {/* Self-Healing Header Status & Alert Banner */}
      {activeAlert && (
        <div className="mx-3 mt-2 px-3.5 py-2 rounded-lg bg-[#2a1717] border border-[#4a2222] text-xs flex items-center justify-between text-[#fca5a5] shadow-lg animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert size={15} className="text-[#f87171] shrink-0 animate-pulse" />
            <div className="truncate">
              <span className="font-semibold text-white mr-1.5">[{activeAlert.title}]:</span>
              <span className="font-mono text-[11px] text-[#fca5a5]">{activeAlert.snippet}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              onClick={() => handleAutoFix(activeAlert)}
              title="Kirim instruksi perbaikan otomatis ke terminal agent"
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#381a1a] hover:bg-[#4a2424] text-white border border-[#5a2e2e] text-[11px] font-medium transition-colors"
            >
              <Wrench size={12} className="text-[#f87171]" />
              <span>⚡ Auto-Fix Prompt</span>
            </button>
            <button
              onClick={() => selfHealingWatcher.clearAlert()}
              className="p-1 rounded text-[#a0a0a0] hover:text-white hover:bg-[#381a1a] transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Grid Sub-Header Controls */}
      <div className="px-3 pt-2 pb-1.5 flex items-center justify-between text-[11px] font-mono text-[#777777] border-b border-[#202020] bg-[#141414] shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[#aaaaaa] font-semibold flex items-center gap-1.5">
            <TermIcon size={13} className="text-[#007acc]" />
            <span>Terminal Grid</span>
          </span>

          {/* Quick Tabs in Focus Mode */}
          {layoutMode === "focus" && (
            <div className="flex items-center gap-1 pl-2 border-l border-[#282828]">
              {agents.map((ag) => {
                const isCurrent = (displayedAgents[0]?.id || selectedAgentId) === ag.id;
                return (
                  <button
                    key={ag.id}
                    onClick={() => setSelectedAgentId(ag.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      isCurrent
                        ? "bg-[#252525] text-white border border-[#3e3e3e]"
                        : "text-[#777777] hover:text-[#cccccc] hover:bg-[#1c1c1c]"
                    }`}
                  >
                    {ag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Quick Layout Toggles */}
          <div className="flex items-center bg-[#1a1a1a] p-0.5 rounded border border-[#2a2a2a] text-[10px]">
            <button
              onClick={() => setLayoutMode("focus")}
              title="Focus 1 Terminal"
              className={`px-1.5 py-0.5 rounded transition-colors ${
                layoutMode === "focus" ? "bg-[#262626] text-white" : "text-[#777777] hover:text-[#cccccc]"
              }`}
            >
              1
            </button>
            <button
              onClick={() => setLayoutMode("split")}
              title="Split 2 Terminals"
              className={`px-1.5 py-0.5 rounded transition-colors ${
                layoutMode === "split" ? "bg-[#262626] text-white" : "text-[#777777] hover:text-[#cccccc]"
              }`}
            >
              2
            </button>
            <button
              onClick={() => setLayoutMode("matrix")}
              title="Matrix 4 Terminals"
              className={`px-1.5 py-0.5 rounded transition-colors ${
                layoutMode === "matrix" ? "bg-[#262626] text-white" : "text-[#777777] hover:text-[#cccccc]"
              }`}
            >
              4
            </button>
          </div>

          <button
            onClick={handleToggleSelfHealing}
            title={selfHealingEnabled ? "Self-Healing Watcher Aktif (Klik untuk nonaktifkan)" : "Aktifkan Self-Healing Watcher"}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors ${
              selfHealingEnabled
                ? "bg-[#18261c] text-[#10b981] border-[#22442c]"
                : "bg-[#1e1e1e] text-[#888888] border-[#2c2c2c] hover:text-[#cccccc]"
            }`}
          >
            <Wrench size={10} className={selfHealingEnabled ? "text-[#10b981]" : ""} />
            <span>Self-Healing: {selfHealingEnabled ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      {/* Main Terminal Grid */}
      <div className={`flex-1 p-2 grid gap-2.5 h-full overflow-hidden ${gridClass}`}>
        {displayedAgents.map((agent) => (
          <AgentTerminalCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
};
