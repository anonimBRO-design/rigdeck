import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRigStore } from "../store/useRigStore";
import { MISSION_BLUEPRINTS, MissionBlueprint } from "../services/blueprints";
import { soundFx } from "../services/soundFx";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  LayoutGrid,
  Terminal,
  History,
  Sparkles,
  Cpu,
  Volume2,
  VolumeX,
  Eye,
  FileCode2,
  FolderGit2,
  ArrowRight,
  BookOpen,
  GitPullRequest,
  Check,
} from "lucide-react";

export interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  onSelectViewMode: (mode: "conductor" | "terminals") => void;
  onOpenHistory: () => void;
}

interface PaletteAction {
  id: string;
  category: "Navigation" | "Blueprints" | "Projects" | "Threads" | "Agents" | "Settings";
  title: string;
  subtitle?: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  onClose,
  onSelectViewMode,
  onOpenHistory,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    projects,
    switchActiveProject,
    activeProject,
    conversations,
    setActiveConversationId,
    autoRelayEnabled,
    toggleAutoRelay,
    ecoMode,
    toggleEcoMode,
    audioEnabled,
    toggleAudio,
    miniHudMode,
    toggleMiniHud,
    setPendingBlueprintPrompt,
    setSelectedAgentId,
    setSelectedDiffTask,
    tasks,
  } = useRigStore();

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allActions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];

    // --- 1. Views & Modals ---
    list.push({
      id: "view-conductor",
      category: "Navigation",
      title: "View: Valence (Conductor) & 3 Desktop GUIs",
      subtitle: "Switch ke split view Conductor Chat dan Controller Deck",
      icon: <LayoutGrid size={14} className="text-[#007acc]" />,
      action: () => {
        onSelectViewMode("conductor");
        onClose();
      },
    });

    list.push({
      id: "view-terminals",
      category: "Navigation",
      title: "View: Task DAG & Multi-PTY Terminal Grid",
      subtitle: "Switch ke terminal full view & visual DAG state",
      icon: <Terminal size={14} className="text-[#10b981]" />,
      action: () => {
        onSelectViewMode("terminals");
        onClose();
      },
    });

    list.push({
      id: "open-history",
      category: "Navigation",
      title: "Open: Audit Trail & Message Search",
      subtitle: "Buka riwayat eksekusi, HITL prompt, dan pencarian FTS5",
      shortcut: "History",
      icon: <History size={14} className="text-[#eab308]" />,
      action: () => {
        onOpenHistory();
        onClose();
      },
    });

    list.push({
      id: "open-diff-viewer",
      category: "Navigation",
      title: "Open: 3-Way Worktree Diff Viewer",
      subtitle: "Inspeksi perubahan file di isolated worktree sebelum merge",
      icon: <GitPullRequest size={14} className="text-[#a855f7]" />,
      action: () => {
        const inReviewTask = tasks.find((t) => t.status === "in_review") || tasks[0];
        if (inReviewTask) setSelectedDiffTask(inReviewTask);
        onClose();
      },
    });

    list.push({
      id: "open-obsidian-vault",
      category: "Navigation",
      title: "Open: Obsidian Shared Memory Vault",
      subtitle: "Buka folder rig-memory/ (00-INDEX.md) di sistem",
      icon: <BookOpen size={14} className="text-[#8b5cf6]" />,
      action: () => {
        if (activeProject?.path) {
          invoke("open_in_file_manager", { path: `${activeProject.path}/rig-memory/00-INDEX.md` }).catch(() => {
            // fallback ignore
          });
        }
        onClose();
      },
    });

    // --- 2. Mission Blueprints ---
    MISSION_BLUEPRINTS.forEach((bp: MissionBlueprint) => {
      list.push({
        id: `blueprint-${bp.id}`,
        category: "Blueprints",
        title: `${bp.icon} ${bp.title}`,
        subtitle: bp.description,
        icon: <Sparkles size={14} className="text-[#007acc]" />,
        action: () => {
          setPendingBlueprintPrompt(bp.prompt);
          onSelectViewMode("conductor");
          soundFx.playMissionDispatched();
          onClose();
        },
      });
    });

    // --- 3. Projects ---
    projects.forEach((p) => {
      list.push({
        id: `project-${p.id}`,
        category: "Projects",
        title: `Project: ${p.name}`,
        subtitle: p.path,
        icon: <FolderGit2 size={14} className="text-[#f59e0b]" />,
        action: async () => {
          await switchActiveProject(p.id);
          onClose();
        },
      });
    });

    // --- 4. Threads ---
    conversations.forEach((conv) => {
      list.push({
        id: `thread-${conv.id}`,
        category: "Threads",
        title: `Mission: ${conv.title}`,
        subtitle: `Model: ${conv.model} • ${new Date(conv.updated_at).toLocaleDateString()}`,
        icon: <FileCode2 size={14} className="text-[#38bdf8]" />,
        action: () => {
          setActiveConversationId(conv.id);
          onSelectViewMode("conductor");
          onClose();
        },
      });
    });

    // --- 5. Agents Quick Focus ---
    list.push({
      id: "agent-claude",
      category: "Agents",
      title: "Focus: Mas Claude (The Architect)",
      subtitle: "Pilih terminal Lead Architect / Claude Desktop",
      icon: <Terminal size={14} className="text-[#d97706]" />,
      action: () => {
        setSelectedAgentId("agent-arch");
        onSelectViewMode("terminals");
        onClose();
      },
    });

    list.push({
      id: "agent-agy",
      category: "Agents",
      title: "Focus: Mbak Agy (The Coder & OS)",
      subtitle: "Pilih terminal Feature Developer / Antigravity",
      icon: <Terminal size={14} className="text-[#007acc]" />,
      action: () => {
        setSelectedAgentId("agent-coder");
        onSelectViewMode("terminals");
        onClose();
      },
    });

    list.push({
      id: "agent-codex",
      category: "Agents",
      title: "Focus: Bg Codex (The Reviewer)",
      subtitle: "Pilih terminal Security Reviewer / ChatGPT Desktop",
      icon: <Terminal size={14} className="text-[#10b981]" />,
      action: () => {
        setSelectedAgentId("agent-reviewer");
        onSelectViewMode("terminals");
        onClose();
      },
    });

    // --- 6. Settings / Toggles ---
    list.push({
      id: "toggle-auto-relay",
      category: "Settings",
      title: `Auto-Relay Pipeline: ${autoRelayEnabled ? "Enabled (Turn OFF)" : "Disabled (Turn ON)"}`,
      subtitle: "Otomasi spec handoff dari Mas Claude -> Mbak Agy -> Bg Codex",
      icon: <ArrowRight size={14} className={autoRelayEnabled ? "text-[#10b981]" : "text-[#777777]"} />,
      action: () => {
        toggleAutoRelay();
        onClose();
      },
    });

    list.push({
      id: "toggle-eco-mode",
      category: "Settings",
      title: `Eco Mode (Quota Radar): ${ecoMode ? "Active (Switch Normal)" : "Inactive (Switch ECO)"}`,
      subtitle: "Routing otomatis ke model hemat token saat kuota menipis",
      icon: <Cpu size={14} className={ecoMode ? "text-[#10b981]" : "text-[#777777]"} />,
      action: () => {
        toggleEcoMode();
        onClose();
      },
    });

    list.push({
      id: "toggle-audio-cues",
      category: "Settings",
      title: `Audio Synthesizer FX: ${audioEnabled ? "Mute Sound" : "Enable Sound"}`,
      subtitle: "Efek suara Web Audio saat dispatch misi, alert, dan complete",
      icon: audioEnabled ? <Volume2 size={14} className="text-[#38bdf8]" /> : <VolumeX size={14} className="text-[#777777]" />,
      action: () => {
        toggleAudio();
        onClose();
      },
    });

    list.push({
      id: "toggle-mini-hud",
      category: "Settings",
      title: `Mini HUD Overlay: ${miniHudMode ? "Disable PiP" : "Enable Picture-in-Picture"}`,
      subtitle: "Floating compact telemetry & agent progress monitor",
      icon: <Eye size={14} className={miniHudMode ? "text-[#a855f7]" : "text-[#777777]"} />,
      action: () => {
        toggleMiniHud();
        onClose();
      },
    });

    return list;
  }, [
    onSelectViewMode,
    onOpenHistory,
    onClose,
    tasks,
    activeProject?.path,
    setPendingBlueprintPrompt,
    projects,
    switchActiveProject,
    conversations,
    setActiveConversationId,
    setSelectedAgentId,
    autoRelayEnabled,
    toggleAutoRelay,
    ecoMode,
    toggleEcoMode,
    audioEnabled,
    toggleAudio,
    miniHudMode,
    toggleMiniHud,
    setSelectedDiffTask,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allActions;
    return allActions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.subtitle && a.subtitle.toLowerCase().includes(q)) ||
        a.category.toLowerCase().includes(q)
    );
  }, [allActions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filtered[selectedIndex];
      if (current) {
        soundFx.playRelayStep();
        current.action();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#161616] border border-[#2c2c2c] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-[#262626] flex items-center gap-3 bg-[#181818]">
          <Search size={18} className="text-[#007acc] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik perintah, misi, blueprint, atau navigasi… (↑↓ pilih, Enter jalankan)"
            className="flex-1 bg-transparent text-sm text-[#f0f0f0] placeholder:text-[#555555] focus:outline-none"
          />
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#202020] text-[#777777] border border-[#2a2a2a]">
            ESC to close
          </span>
        </div>

        {/* Action List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 && (
            <div className="text-center py-10 text-xs text-[#666666]">
              Tidak ada perintah yang cocok dengan “{query}”.
            </div>
          )}

          {filtered.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                onClick={() => {
                  soundFx.playRelayStep();
                  item.action();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-[#007acc]/15 border border-[#007acc]/40 text-white"
                    : "hover:bg-[#1f1f1f] border border-transparent text-[#cccccc]"
                }`}
              >
                <div
                  className={`p-1.5 rounded-md shrink-0 ${
                    isSelected ? "bg-[#007acc]/30 text-white" : "bg-[#202020] text-[#888888]"
                  }`}
                >
                  {item.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{item.title}</span>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-[#202020] text-[#666666] border border-[#282828]">
                      {item.category}
                    </span>
                  </div>
                  {item.subtitle && (
                    <p className="text-[11px] text-[#777777] truncate mt-0.5">{item.subtitle}</p>
                  )}
                </div>

                {item.shortcut && (
                  <span className="text-[10px] font-mono text-[#666666] px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#262626]">
                    {item.shortcut}
                  </span>
                )}

                {isSelected && (
                  <span className="text-xs text-[#007acc] shrink-0">
                    <Check size={14} />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-3.5 py-2 border-t border-[#262626] bg-[#141414] flex items-center justify-between text-[11px] font-mono text-[#555555]">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigasi</span>
            <span>↵ Jalankan</span>
            <span>Esc Tutup</span>
          </div>
          <span>{filtered.length} Perintah Tersedia</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPaletteModal;
