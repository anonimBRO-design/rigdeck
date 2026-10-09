import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRigStore } from "../store/useRigStore";
import { LayoutMode } from "../types";
import { shortenPath, pickProjectFolder, projectBasename } from "../services/projects";
import { soundFx } from "../services/soundFx";
import {
  Layers,
  Columns,
  Grid,
  Zap,
  FolderOpen,
  ChevronDown,
  Check,
  Loader2,
  FolderPlus,
  History,
  Leaf,
  Flame,
  Volume2,
  VolumeX,
  Minimize2,
} from "lucide-react";

interface RouterHealthResponse {
  online: boolean;
  active_models_count: number;
  latency_ms: number;
}

interface HeaderProps {
  onOpenHistory?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenHistory }) => {
  const {
    layoutMode,
    setLayoutMode,
    projects,
    activeProject,
    projectSwitching,
    loadProjects,
    switchActiveProject,
    openProjectFolder,
    ecoMode,
    toggleEcoMode,
    sessionTokens,
    audioEnabled,
    toggleAudio,
    miniHudMode,
    toggleMiniHud,
  } = useRigStore();

  const [routerHealth, setRouterHealth] = useState<RouterHealthResponse>({
    online: false,
    active_models_count: 0,
    latency_ms: 0,
  });
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      try {
        const res = await invoke<RouterHealthResponse>("get_router_status");
        if (isMounted) {
          setRouterHealth(res);
        }
      } catch (e) {
        console.warn("9Router poll error:", e);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Muat registry project sekali saat header terpasang
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    if (!projectMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [projectMenuOpen]);

  const handleSwitchProject = async (projectId: string) => {
    setProjectMenuOpen(false);
    setProjectError(null);
    if (projectId === activeProject?.id) return;
    const project = await switchActiveProject(projectId);
    if (!project) setProjectError("Gagal berpindah project (cek terminal log).");
  };

  const handleOpenFolder = async () => {
    setProjectError(null);
    const folder = await pickProjectFolder();
    if (!folder) return;
    const project = await openProjectFolder(folder, projectBasename(folder));
    if (!project) setProjectError(`Gagal membuka folder: ${folder}`);
    setProjectMenuOpen(false);
  };

  const layoutButtons: { mode: LayoutMode; icon: React.ReactNode; label: string }[] = [
    { mode: "focus", icon: <Layers size={13} />, label: "Focus (1)" },
    { mode: "split", icon: <Columns size={13} />, label: "Split (2)" },
    { mode: "matrix", icon: <Grid size={13} />, label: "Matrix (4)" },
  ];

  return (
    <header className="h-11 border-b border-[#262626] bg-[#161616] px-4 flex items-center justify-between">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-[#222222] border border-[#333333] flex items-center justify-center font-bold text-xs text-[#007acc]">
            RD
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-xs tracking-tight">RigDeck</span>
            <span className="text-[10px] text-[#888888] font-mono px-1.5 py-0.2 rounded bg-[#1f1f1f] border border-[#2e2e2e]">
              v1.1
            </span>
          </div>
        </div>

        <div className="h-3.5 w-[1px] bg-[#2a2a2a] mx-1" />

        {/* Project Selector Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setProjectMenuOpen((v) => !v)}
            title={activeProject?.path ?? "Belum ada project aktif"}
            className="flex items-center gap-2 bg-[#1a1a1a] border border-[#282828] hover:border-[#3a3a3a] rounded-md px-2.5 py-1 text-xs transition-colors max-w-[280px]"
          >
            {projectSwitching ? (
              <Loader2 size={12} className="animate-spin text-[#007acc] shrink-0" />
            ) : (
              <FolderOpen size={12} className="text-[#007acc] shrink-0" />
            )}
            <span className="text-[#e0e0e0] font-medium truncate">
              {activeProject?.name ?? "Pilih Project…"}
            </span>
            <span className="text-[#666666] font-mono text-[10px] truncate hidden md:inline">
              {activeProject ? shortenPath(activeProject.path, 2) : ""}
            </span>
            <ChevronDown size={12} className="text-[#666666] shrink-0" />
          </button>

          {projectMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-[340px] bg-[#181818] border border-[#2e2e2e] rounded-lg shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-[#242424] flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-[#777777] font-semibold">
                  Recent Projects
                </span>
                <span className="text-[10px] font-mono text-[#555555]">
                  {projects.length} total
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto py-1">
                {projects.length === 0 && (
                  <div className="px-3 py-3 text-[11px] text-[#666666]">
                    Belum ada project terdaftar.
                  </div>
                )}
                {projects.map((p) => {
                  const isActive = p.id === activeProject?.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSwitchProject(p.id)}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-[#202020] transition-colors ${
                        isActive ? "bg-[#1c1c1c]" : ""
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isActive ? (
                          <Check size={12} className="text-[#10b981]" />
                        ) : (
                          <FolderOpen size={12} className="text-[#666666]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[11px] font-medium truncate ${
                            isActive ? "text-[#10b981]" : "text-[#d0d0d0]"
                          }`}
                        >
                          {p.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#666666] truncate">
                          {shortenPath(p.path, 3)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {projectError && (
                <div className="px-3 py-1.5 text-[10px] text-[#ef4444] border-t border-[#242424]">
                  {projectError}
                </div>
              )}

              <button
                onClick={handleOpenFolder}
                className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-[#242424] text-[11px] text-[#007acc] hover:bg-[#1c1c1c] transition-colors"
              >
                <FolderPlus size={13} />
                <span>+ Open Project Folder…</span>
              </button>
            </div>
          )}
        </div>

        {/* Real-time 9Router Telemetry Pill */}
        <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#282828] rounded-md px-2.5 py-0.5 text-xs">
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              routerHealth.online ? "bg-[#10b981]" : "bg-[#ef4444]"
            }`}
          />
          <span className="text-[#a0a0a0] font-mono text-[11px]">9Router :20128</span>
          <span className="text-[#444444] font-mono text-[11px]">•</span>
          <span
            className={`font-mono text-[11px] ${
              routerHealth.online ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {routerHealth.online ? `${routerHealth.latency_ms}ms` : "Offline"}
          </span>
          <span className="text-[#444444] font-mono text-[11px]">•</span>
          <span className="text-[#888888] font-mono text-[11px] flex items-center gap-1">
            <Zap size={10} className="text-[#a0a0a0]" />
            {routerHealth.active_models_count} models
          </span>
        </div>
      </div>

      {/* Right Controls: Token Radar + Sound + HUD + History + Layout */}
      <div className="flex items-center gap-2">
        {/* Token & Quota Radar Pill */}
        <button
          onClick={() => {
            soundFx.playClick();
            toggleEcoMode();
          }}
          title={`Token & Quota Radar (${sessionTokens} tokens sesi ini). Klik untuk toggle Eco Mode.`}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono border transition-colors ${
            ecoMode
              ? "bg-[#14261c] text-[#10b981] border-[#1e3d29]"
              : "bg-[#1a1a1a] text-[#888888] border-[#282828] hover:text-[#cccccc]"
          }`}
        >
          {ecoMode ? (
            <Leaf size={11} className="text-[#10b981]" />
          ) : (
            <Flame size={11} className="text-[#f59e0b]" />
          )}
          <span className="text-[11px] font-medium">{ecoMode ? "Eco Mode" : "Max"}</span>
          <span className="text-[#444444]">•</span>
          <span className="text-[10px] text-[#888888]">{Math.round(sessionTokens / 1000)}k tok</span>
        </button>

        {/* Audio FX Toggle */}
        <button
          onClick={() => {
            const next = toggleAudio();
            if (next) soundFx.playClick();
          }}
          title={audioEnabled ? "Efek Suara Aktif (Klik untuk mute)" : "Efek Suara Hening (Muted)"}
          className={`p-1.5 rounded-md border transition-colors ${
            audioEnabled
              ? "text-[#cccccc] bg-[#202020] border-[#303030]"
              : "text-[#666666] bg-[#1a1a1a] border-[#282828] hover:text-[#aaaaaa]"
          }`}
        >
          {audioEnabled ? <Volume2 size={13} className="text-[#007acc]" /> : <VolumeX size={13} />}
        </button>

        {/* Floating Mini HUD Toggle */}
        <button
          onClick={() => {
            soundFx.playClick();
            toggleMiniHud();
          }}
          title={miniHudMode ? "Sembunyikan Mini HUD Overlay" : "Buka Floating Mini HUD Overlay (Picture-in-Picture)"}
          className={`p-1.5 rounded-md border transition-colors ${
            miniHudMode
              ? "bg-[#282828] text-[#007acc] border-[#383838]"
              : "text-[#888888] hover:text-[#cccccc] hover:bg-[#202020] border-[#282828]"
          }`}
        >
          <Minimize2 size={13} />
        </button>

        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[#888888] hover:text-[#cccccc] hover:bg-[#202020] border border-[#282828] transition-colors"
            title="Audit trail: delegasi misi, HITL, dan event eksekusi"
          >
            <History size={13} />
            <span className="hidden sm:inline text-[11px]">History</span>
          </button>
        )}

        <div className="flex items-center bg-[#1a1a1a] p-0.5 rounded-md border border-[#282828]">
          {layoutButtons.map((btn) => (
            <button
              key={btn.mode}
              onClick={() => setLayoutMode(btn.mode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                layoutMode === btn.mode
                  ? "bg-[#282828] text-white border border-[#383838]"
                  : "text-[#888888] hover:text-[#cccccc] hover:bg-[#202020]"
              }`}
            >
              {btn.icon}
              <span className="hidden sm:inline text-[11px]">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

export default Header;
