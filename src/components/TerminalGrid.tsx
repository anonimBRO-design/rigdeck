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
