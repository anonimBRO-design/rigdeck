import React, { useState, useEffect, useRef } from "react";
import { Header } from "./components/Header";
import { MasterConductorChat } from "./components/MasterConductorChat";
import { GuiControllerDeck } from "./components/GuiControllerDeck";
import { TaskBoard } from "./components/TaskBoard";
import { TerminalGrid } from "./components/TerminalGrid";
import { TaskDagCanvas } from "./components/TaskDagCanvas";
import { DiffViewerModal } from "./components/DiffViewerModal";
import { HitlAlert } from "./components/HitlAlert";
import { HistoryModal } from "./components/HistoryModal";
import { MiniHudOverlay } from "./components/MiniHudOverlay";
import { CommandPaletteModal } from "./components/CommandPaletteModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useRigStore } from "./store/useRigStore";
import { namaOS } from "./lib/platform";
import {
  LayoutGrid,
  Terminal,
  History,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  Rows2,
  Columns2,
  Workflow,
  RotateCcw,
} from "lucide-react";

type EngineeringLayout = "split-h" | "split-v" | "dag-only" | "terminals-only";

export const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<"conductor" | "terminals">("conductor");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { miniHudMode, toggleMiniHud } = useRigStore();

  // --------------------------------------------------------------------------
  // Resizable Panels & Layout Configuration
  // --------------------------------------------------------------------------
  const [engLayout, setEngLayout] = useState<EngineeringLayout>("split-h");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [dagHeight, setDagHeight] = useState(250);
  const [dagWidthPercent, setDagWidthPercent] = useState(48);

  // Dragging states
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingDagH, setIsDraggingDagH] = useState(false);
  const [isDraggingDagV, setIsDraggingDagV] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const engRightAreaRef = useRef<HTMLDivElement>(null);

  // Reset to default panel sizes
  const handleResetSizes = () => {
    setSidebarWidth(280);
    setDagHeight(250);
    setDagWidthPercent(48);
    setSidebarCollapsed(false);
    setEngLayout("split-h");
  };

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Global mouse handlers for resizable panels
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar) {
        const newWidth = Math.max(180, Math.min(520, e.clientX));
        setSidebarWidth(newWidth);
      } else if (isDraggingDagH && engRightAreaRef.current) {
        const rect = engRightAreaRef.current.getBoundingClientRect();
        const newHeight = Math.max(120, Math.min(rect.height - 140, e.clientY - rect.top));
        setDagHeight(newHeight);
      } else if (isDraggingDagV && engRightAreaRef.current) {
        const rect = engRightAreaRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const percent = Math.max(25, Math.min(75, (offsetX / rect.width) * 100));
        setDagWidthPercent(percent);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
      setIsDraggingDagH(false);
      setIsDraggingDagV(false);
    };

    if (isDraggingSidebar || isDraggingDagH || isDraggingDagV) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor =
        isDraggingDagH ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDraggingSidebar, isDraggingDagH, isDraggingDagV]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-screen w-screen overflow-hidden bg-[#121212] text-[#cccccc] font-sans select-none"
    >
      {/* Top Header & Telemetry Bar */}
      <Header onOpenHistory={() => setHistoryOpen(true)} />

      {/* View Mode & Layout Toolbar Sub-Header */}
      <div className="h-9 px-3 bg-[#161616] border-b border-[#242424] flex items-center justify-between text-xs shrink-0 select-none">
        {/* Left: View Mode Toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode("conductor")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === "conductor"
                ? "bg-[#242424] border border-[#383838] text-white shadow-sm"
                : "text-[#888888] hover:text-[#cccccc] hover:bg-[#1e1e1e]"
            }`}
          >
            <LayoutGrid size={13} className={viewMode === "conductor" ? "text-[#007acc]" : "text-[#777777]"} />
            <span>Valence (Conductor) & 4 Desktop GUIs</span>
          </button>

          <button
            onClick={() => setViewMode("terminals")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === "terminals"
                ? "bg-[#242424] border border-[#383838] text-white shadow-sm"
                : "text-[#888888] hover:text-[#cccccc] hover:bg-[#1e1e1e]"
            }`}
          >
            <Terminal size={13} className={viewMode === "terminals" ? "text-[#007acc]" : "text-[#777777]"} />
            <span>Task DAG & Multi-PTY Terminal Grid</span>
          </button>
        </div>

        {/* Center: Interactive Layout Switcher for Engineering View */}
        {viewMode === "terminals" && (
          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#141414] border border-[#262626]">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? "Buka Sidebar Task Blackboard" : "Sembunyikan Sidebar Task"}
              className={`p-1 rounded transition-colors ${
                sidebarCollapsed ? "text-[#777777] hover:text-[#cccccc]" : "text-[#007acc] bg-[#1e1e1e]"
              }`}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
            </button>

            <div className="h-3 w-[1px] bg-[#2a2a2a] mx-0.5" />

            {/* Split Horizontal (Default: DAG Atas, Terminal Bawah) */}
            <button
              onClick={() => setEngLayout("split-h")}
              title="Layout: Split Horisontal (DAG di Atas, Terminal di Bawah)"
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                engLayout === "split-h"
                  ? "bg-[#252525] text-white border border-[#3a3a3a]"
                  : "text-[#777777] hover:text-[#cccccc]"
              }`}
            >
              <Rows2 size={12} className={engLayout === "split-h" ? "text-[#007acc]" : ""} />
              <span>Split H</span>
            </button>

            {/* Split Vertical (DAG Kiri, Terminal Kanan) */}
            <button
              onClick={() => setEngLayout("split-v")}
              title="Layout: Split Vertikal (DAG di Kiri, Terminal di Kanan)"
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                engLayout === "split-v"
                  ? "bg-[#252525] text-white border border-[#3a3a3a]"
                  : "text-[#777777] hover:text-[#cccccc]"
              }`}
            >
              <Columns2 size={12} className={engLayout === "split-v" ? "text-[#007acc]" : ""} />
              <span>Split V</span>
            </button>

            {/* DAG Only */}
            <button
              onClick={() => setEngLayout("dag-only")}
              title="Layout: Maksimalkan DAG Flow Canvas"
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                engLayout === "dag-only"
                  ? "bg-[#252525] text-white border border-[#3a3a3a]"
                  : "text-[#777777] hover:text-[#cccccc]"
              }`}
            >
              <Workflow size={12} className={engLayout === "dag-only" ? "text-[#007acc]" : ""} />
              <span>DAG Max</span>
            </button>

            {/* Terminals Only */}
            <button
              onClick={() => setEngLayout("terminals-only")}
              title="Layout: Maksimalkan Terminal Grid"
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                engLayout === "terminals-only"
                  ? "bg-[#252525] text-white border border-[#3a3a3a]"
                  : "text-[#777777] hover:text-[#cccccc]"
              }`}
            >
              <Terminal size={12} className={engLayout === "terminals-only" ? "text-[#007acc]" : ""} />
              <span>Terminal Max</span>
            </button>

            <div className="h-3 w-[1px] bg-[#2a2a2a] mx-0.5" />

            {/* Reset panel sizes */}
            <button
              onClick={handleResetSizes}
              title="Reset ukuran panel ke default"
              className="p-1 rounded text-[#666666] hover:text-[#cccccc] hover:bg-[#1f1f1f] transition-colors"
            >
              <RotateCcw size={11} />
            </button>
          </div>
        )}

        {/* Right Tools & Palette */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaletteOpen(true)}
            title="Global Command Palette (Ctrl + K / ⌘K)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#1f1f1f] hover:bg-[#282828] text-[#cccccc] hover:text-white border border-[#2e2e2e] transition-colors"
          >
            <Command size={11} className="text-[#007acc]" />
            <span>Command Palette</span>
            <kbd className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#161616] text-[#777777] border border-[#262626]">
              Ctrl+K
            </kbd>
          </button>

          <button
            onClick={() => setHistoryOpen(true)}
            title="Audit trail: delegasi misi, HITL, dan event eksekusi"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-[#888888] hover:text-[#cccccc] hover:bg-[#1e1e1e] border border-transparent hover:border-[#2e2e2e] transition-colors"
          >
            <History size={12} />
            <span>History</span>
          </button>

          <div className="text-[11px] font-mono text-[#666666] hidden lg:block">
            RigDeck Desktop Orchestrator • {namaOS}
          </div>
        </div>
      </div>

      {/* Main Mission Control Work Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {viewMode === "conductor" ? (
          /* ================================================================= */
          /* Conductor View: Master Chat (Left Fixed) + 4 Desktop GUIs (Right)  */
          /* ================================================================= */
          <div className="flex flex-1 overflow-hidden w-full h-full">
            {/* Master Conductor Panel (Conversations Sidebar + Chat) */}
            <div className="shrink-0 h-full overflow-hidden flex flex-col">
              <ErrorBoundary fallbackTitle="Error pada Conductor Chat">
                <MasterConductorChat />
              </ErrorBoundary>
            </div>

            {/* Desktop GUI Controller Deck */}
            <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
              <ErrorBoundary fallbackTitle="Error pada Desktop GUI Controller">
                <GuiControllerDeck />
              </ErrorBoundary>
            </div>
          </div>
        ) : (
          /* ================================================================= */
          /* Engineering View: Resizable TaskBoard + Resizable DAG & Terminals  */
          /* ================================================================= */
          <div className="flex flex-1 overflow-hidden w-full h-full">
            {/* Resizable Sidebar (TaskBoard) */}
            {!sidebarCollapsed && (
              <>
                <div
                  style={{ width: `${sidebarWidth}px` }}
                  className="h-full shrink-0 overflow-hidden flex flex-col border-r border-[#242424]"
                >
                  <ErrorBoundary fallbackTitle="Error pada Task Board">
                    <TaskBoard />
                  </ErrorBoundary>
                </div>

                {/* Draggable Vertical Splitter for Sidebar */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsDraggingSidebar(true);
                  }}
                  className="w-1.5 hover:w-2 bg-[#181818] hover:bg-[#007acc]/60 cursor-col-resize transition-all shrink-0 relative group z-20 flex items-center justify-center"
                  title="Drag untuk mengubah lebar Blackboard Sidebar"
                >
                  <div className="h-6 w-0.5 bg-[#444444] group-hover:bg-white rounded" />
                </div>
              </>
            )}

            {/* Main Area: Resizable DAG & Terminal Grid */}
            <div
              ref={engRightAreaRef}
              className="flex-1 min-w-0 flex flex-col overflow-hidden p-2 gap-2"
            >
              {/* LAYOUT 1: Split Horisontal (DAG Atas, Terminal Bawah) */}
              {engLayout === "split-h" && (
                <div className="flex-1 flex flex-col overflow-hidden w-full h-full">
                  {/* Top: DAG Canvas */}
                  <div
                    style={{ height: `${dagHeight}px` }}
                    className="shrink-0 overflow-hidden rounded-lg border border-[#242424]"
                  >
                    <ErrorBoundary fallbackTitle="Error pada DAG Flow Canvas">
                      <TaskDagCanvas />
                    </ErrorBoundary>
                  </div>

                  {/* Draggable Horizontal Splitter */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsDraggingDagH(true);
                    }}
                    className="h-2 hover:h-2.5 my-1 bg-[#181818] hover:bg-[#007acc]/60 rounded cursor-row-resize transition-all shrink-0 relative group flex items-center justify-center"
                    title="Drag untuk mengubah tinggi DAG / Terminal"
                  >
                    <div className="w-10 h-0.5 bg-[#444444] group-hover:bg-white rounded" />
                  </div>

                  {/* Bottom: Terminal Grid */}
                  <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-[#242424]">
                    <ErrorBoundary fallbackTitle="Error pada Terminal Grid">
                      <TerminalGrid />
                    </ErrorBoundary>
                  </div>
                </div>
              )}

              {/* LAYOUT 2: Split Vertikal (DAG Kiri, Terminal Kanan) */}
              {engLayout === "split-v" && (
                <div className="flex-1 flex overflow-hidden w-full h-full">
                  {/* Left: DAG Canvas */}
                  <div
                    style={{ width: `${dagWidthPercent}%` }}
                    className="shrink-0 overflow-hidden rounded-lg border border-[#242424]"
                  >
                    <ErrorBoundary fallbackTitle="Error pada DAG Flow Canvas">
                      <TaskDagCanvas />
                    </ErrorBoundary>
                  </div>

                  {/* Draggable Vertical Splitter */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsDraggingDagV(true);
                    }}
                    className="w-2 hover:w-2.5 mx-1 bg-[#181818] hover:bg-[#007acc]/60 rounded cursor-col-resize transition-all shrink-0 relative group flex items-center justify-center"
                    title="Drag untuk mengubah lebar DAG / Terminal"
                  >
                    <div className="h-10 w-0.5 bg-[#444444] group-hover:bg-white rounded" />
                  </div>

                  {/* Right: Terminal Grid */}
                  <div className="flex-1 min-w-0 overflow-hidden rounded-lg border border-[#242424]">
                    <ErrorBoundary fallbackTitle="Error pada Terminal Grid">
                      <TerminalGrid />
                    </ErrorBoundary>
                  </div>
                </div>
              )}

              {/* LAYOUT 3: DAG Only (Maximized) */}
              {engLayout === "dag-only" && (
                <div className="flex-1 overflow-hidden rounded-lg border border-[#242424] w-full h-full">
                  <ErrorBoundary fallbackTitle="Error pada DAG Flow Canvas">
                    <TaskDagCanvas />
                  </ErrorBoundary>
                </div>
              )}

              {/* LAYOUT 4: Terminals Only (Maximized) */}
              {engLayout === "terminals-only" && (
                <div className="flex-1 overflow-hidden rounded-lg border border-[#242424] w-full h-full">
                  <ErrorBoundary fallbackTitle="Error pada Terminal Grid">
                    <TerminalGrid />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Floating Interceptor Alert (HUD) */}
        <HitlAlert />
      </div>

      {/* 3-Way Worktree Diff Viewer Modal */}
      <DiffViewerModal />

      {/* Persistent Audit Trail (missions, HITL, execution events) */}
      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPaletteModal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectViewMode={setViewMode}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      {/* Floating Mini HUD Overlay (Picture-in-Picture) */}
      {miniHudMode && <MiniHudOverlay onExpand={toggleMiniHud} />}
    </div>
  );
};

export default App;
