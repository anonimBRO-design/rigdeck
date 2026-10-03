import React, { useState } from "react";
import { Header } from "./components/Header";
import { TaskBoard } from "./components/TaskBoard";
import { TerminalGrid } from "./components/TerminalGrid";
import { DiffViewerModal } from "./components/DiffViewerModal";
import { HitlAlert } from "./components/HitlAlert";
import { TaskDagCanvas } from "./components/TaskDagCanvas";
import { ChevronUp, ChevronDown, Workflow } from "lucide-react";

export const App: React.FC = () => {
  const [showDagCanvas, setShowDagCanvas] = useState<boolean>(true);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0f17] text-slate-100 font-sans">
      {/* Top Header & Telemetry Bar */}
      <Header />

      {/* Main Mission Control Work Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: Task Blackboard & Backlog */}
        <TaskBoard />

        {/* Center / Right: DAG Flow & Multiplexed xterm.js Terminal Grid */}
        <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
          {/* Top: Autonomous Task DAG Canvas */}
          {showDagCanvas && (
            <div className="h-64 shrink-0 transition-all duration-300">
              <TaskDagCanvas />
            </div>
          )}

          {/* Toggle Button for DAG Canvas */}
          <div className="flex items-center justify-between px-1 -my-1 text-xs">
            <button
              onClick={() => setShowDagCanvas(!showDagCanvas)}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-800/80 px-2.5 py-0.5 rounded border border-slate-800 transition-colors"
            >
              <Workflow size={12} className="text-blue-400" />
              <span>{showDagCanvas ? "Collapse Task DAG" : "Show Task DAG Canvas"}</span>
              {showDagCanvas ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>

          {/* Bottom: Multiplexed Terminal Grid */}
          <div className="flex-1 overflow-hidden">
            <TerminalGrid />
          </div>
        </div>

        {/* Floating Interceptor Alert (HUD) */}
        <HitlAlert />
      </div>

      {/* 3-Way Worktree Diff Viewer Modal */}
      <DiffViewerModal />
    </div>
  );
};

export default App;
