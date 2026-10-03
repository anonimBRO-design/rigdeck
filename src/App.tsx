import React, { useState } from "react";
import { Header } from "./components/Header";
import { MasterConductorChat } from "./components/MasterConductorChat";
import { GuiControllerDeck } from "./components/GuiControllerDeck";
import { TaskBoard } from "./components/TaskBoard";
import { TerminalGrid } from "./components/TerminalGrid";
import { TaskDagCanvas } from "./components/TaskDagCanvas";
import { DiffViewerModal } from "./components/DiffViewerModal";
import { HitlAlert } from "./components/HitlAlert";
import { Sparkles, Terminal } from "lucide-react";

export const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<"conductor" | "terminals">("conductor");

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0f17] text-slate-100 font-sans">
      {/* Top Header & Telemetry Bar */}
      <Header />

      {/* View Mode Toggle Sub-Header */}
      <div className="h-9 px-4 bg-slate-950/90 border-b border-rig-border/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("conductor")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === "conductor"
                ? "bg-blue-600/25 border border-blue-500/50 text-blue-300 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Sparkles size={12} className="text-blue-400" />
            <span>Master Conductor & 3 Desktop GUIs</span>
          </button>

          <button
            onClick={() => setViewMode("terminals")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === "terminals"
                ? "bg-blue-600/25 border border-blue-500/50 text-blue-300 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Terminal size={12} className="text-emerald-400" />
            <span>Task DAG & Multi-PTY Terminal Grid</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-slate-500 hidden sm:block">
          RigDeck Desktop Orchestrator • Linux CachyOS Wayland Edition
        </div>
      </div>

      {/* Main Mission Control Work Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {viewMode === "conductor" ? (
          /* NEW VISION: 9Router Conductor Chat (Left) + 3 Desktop GUI Cards (Right) */
          <div className="flex flex-1 overflow-hidden w-full h-full">
            <MasterConductorChat />
            <GuiControllerDeck />
          </div>
        ) : (
          /* CLASSIC ENGINEERING VIEW: TaskBoard (Left) + DAG Canvas & Terminal Grid (Right) */
          <div className="flex flex-1 overflow-hidden w-full h-full">
            <TaskBoard />
            <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
              <div className="h-60 shrink-0">
                <TaskDagCanvas />
              </div>
              <div className="flex-1 overflow-hidden">
                <TerminalGrid />
              </div>
            </div>
          </div>
        )}

        {/* Floating Interceptor Alert (HUD) */}
        <HitlAlert />
      </div>

      {/* 3-Way Worktree Diff Viewer Modal */}
      <DiffViewerModal />
    </div>
  );
};

export default App;
