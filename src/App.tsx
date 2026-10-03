import React, { useState } from "react";
import { Header } from "./components/Header";
import { MasterConductorChat } from "./components/MasterConductorChat";
import { GuiControllerDeck } from "./components/GuiControllerDeck";
import { TaskBoard } from "./components/TaskBoard";
import { TerminalGrid } from "./components/TerminalGrid";
import { TaskDagCanvas } from "./components/TaskDagCanvas";
import { DiffViewerModal } from "./components/DiffViewerModal";
import { HitlAlert } from "./components/HitlAlert";
import { LayoutGrid, Terminal } from "lucide-react";

export const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<"conductor" | "terminals">("conductor");

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#121212] text-[#cccccc] font-sans">
      {/* Top Header & Telemetry Bar */}
      <Header />

      {/* View Mode Toggle Sub-Header */}
      <div className="h-9 px-4 bg-[#161616] border-b border-[#262626] flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode("conductor")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === "conductor"
                ? "bg-[#242424] border border-[#383838] text-white"
                : "text-[#888888] hover:text-[#cccccc] hover:bg-[#1e1e1e]"
            }`}
          >
            <LayoutGrid size={13} className={viewMode === "conductor" ? "text-[#007acc]" : "text-[#777777]"} />
            <span>Master Conductor & 3 Desktop GUIs</span>
          </button>

          <button
            onClick={() => setViewMode("terminals")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === "terminals"
                ? "bg-[#242424] border border-[#383838] text-white"
                : "text-[#888888] hover:text-[#cccccc] hover:bg-[#1e1e1e]"
            }`}
          >
            <Terminal size={13} className={viewMode === "terminals" ? "text-[#007acc]" : "text-[#777777]"} />
            <span>Task DAG & Multi-PTY Terminal Grid</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-[#666666] hidden sm:block">
          RigDeck Desktop Orchestrator • Linux CachyOS
        </div>
      </div>

      {/* Main Mission Control Work Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {viewMode === "conductor" ? (
          /* Master Conductor Chat (Left) + 3 Desktop GUI Cards (Right) */
          <div className="flex flex-1 overflow-hidden w-full h-full">
            <MasterConductorChat />
            <GuiControllerDeck />
          </div>
        ) : (
          /* Engineering View: TaskBoard + DAG & Terminal Grid */
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
