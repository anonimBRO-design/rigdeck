import React from "react";
import { Header } from "./components/Header";
import { TaskBoard } from "./components/TaskBoard";
import { TerminalGrid } from "./components/TerminalGrid";
import { DiffViewerModal } from "./components/DiffViewerModal";
import { HitlAlert } from "./components/HitlAlert";

export const App: React.FC = () => {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0f17] text-slate-100 font-sans">
      {/* Top Header & Telemetry Bar */}
      <Header />

      {/* Main Mission Control Work Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: Task DAG & Blackboard State */}
        <TaskBoard />

        {/* Center / Right: Multiplexed xterm.js Terminal Grid */}
        <TerminalGrid />

        {/* Floating Interceptor Alert (HUD) */}
        <HitlAlert />
      </div>

      {/* 3-Way Worktree Diff Viewer Modal */}
      <DiffViewerModal />
    </div>
  );
};

export default App;
