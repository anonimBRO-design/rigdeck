import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
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
} from "lucide-react";

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
        background: "#0c1017",
        foreground: "#cbd5e1",
        cursor: "#38bdf8",
        selectionBackground: "#1e293b",
        black: "#0f172a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#38bdf8",
        white: "#f8fafc",
      },
      fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.3,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);

    // Try WebGL addon with fallback to DOM (Crucial for Linux Wayland WebKitGTK!)
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      console.warn("WebGL not supported, falling back to standard DOM renderer");
    }

    fitAddon.fit();
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
          }
        });

        // Initial info banner in terminal
        term.writeln(`\x1b[38;5;39m[RigDeck Native PTY Connected: ${agent.name} (${agent.id})]\x1b[0m`);
        term.writeln(`\x1b[90mModel: ${agent.model} | Role: ${agent.role}\x1b[0m`);
        term.writeln(`\x1b[90mConnected to CachyOS Linux PTY engine (portable-pty v0.8)\x1b[0m`);
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
      fitAddon.fit();
      invoke("resize_pty", {
        agentId: agent.id,
        rows: term.rows,
        cols: term.cols,
      }).catch(() => {});
    };

    window.addEventListener("resize", handleResize);

    return () => {
      isMounted = false;
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
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : agent.status === "waiting_approval"
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30 animate-pulse"
      : "text-slate-400 bg-slate-800 border-slate-700";

  return (
    <div className="flex flex-col h-full bg-[#0c1017] rounded-xl border border-rig-border overflow-hidden shadow-xl">
      {/* Terminal Title Bar */}
      <div className="h-9 bg-slate-900/90 px-3 flex items-center justify-between border-b border-rig-border">
        <div className="flex items-center gap-2">
          <TermIcon size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">{agent.name}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${statusColor}`}>
            {agent.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {agent.worktreePath && (
            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
              <FolderGit2 size={11} className="text-amber-400" />
              {agent.worktreePath.split("/").pop()}
            </span>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={handleRestartPty}
              title="Restart PTY"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RotateCcw size={12} />
            </button>
            <button
              title="Pause Agent"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Pause size={12} />
            </button>
            <button
              title="Kill Process"
              onClick={() => invoke("kill_pty", { agentId: agent.id })}
              className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
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
  const { agents, layoutMode } = useRigStore();

  let displayedAgents: Agent[] = [];
  let gridClass = "";

  if (layoutMode === "focus") {
    displayedAgents = agents.slice(1, 2); // Show Coder
    gridClass = "grid-cols-1";
  } else if (layoutMode === "split") {
    displayedAgents = agents.slice(1, 3); // Coder + Tester
    gridClass = "grid-cols-2";
  } else {
    displayedAgents = agents.slice(0, 4); // All 4
    gridClass = "grid-cols-2 grid-rows-2";
  }

  return (
    <div className={`flex-1 p-3 grid gap-3 h-full overflow-hidden ${gridClass}`}>
      {displayedAgents.map((agent) => (
        <AgentTerminalCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
};
