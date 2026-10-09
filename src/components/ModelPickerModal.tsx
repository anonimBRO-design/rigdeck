import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  RouterModel,
  getModelFamily,
  formatModelDisplayName,
  formatContextWindow,
} from "../services/conductorAi";
import {
  Search,
  X,
  Star,
  Check,
  Cpu,
  Brain,
  Wrench,
  Eye,
  ChevronDown,
  RefreshCw,
  Sparkles,
  Zap,
  Layers,
  Flame,
  Shield,
  Activity,
  Clock,
} from "lucide-react";

interface ModelPickerModalProps {
  open: boolean;
  onClose: () => void;
  models: RouterModel[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  onRefreshModels?: () => void;
  isRefreshing?: boolean;
}

const PINNED_STORAGE_KEY = "rigdeck_pinned_models_v1";
const RECENT_STORAGE_KEY = "rigdeck_recent_models_v1";

const DEFAULT_PINNED_MODELS = [
  "ag/gemini-3.8-flash-high",
  "claude-opus-5-5",
  "ag/claude-sonnet-4-6",
  "freellm/gpt-4o",
  "nvidia/deepseek-ai/deepseek-v4-pro",
];

type CategoryFilter =
  | "all"
  | "recent"
  | "pinned"
  | "claude"
  | "gemini"
  | "openai"
  | "deepseek"
  | "qwen"
  | "llama"
  | "mistral"
  | "reasoning"
  | "large_context";

const CATEGORY_TABS: { key: CategoryFilter; label: string; icon?: React.ReactNode }[] = [
  { key: "all", label: "Semua" },
  { key: "recent", label: "Terbaru", icon: <Clock size={11} className="text-cyan-400" /> },
  { key: "pinned", label: "Favorit", icon: <Star size={11} className="text-amber-400 fill-amber-400" /> },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "openai", label: "GPT" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "qwen", label: "Qwen" },
  { key: "llama", label: "Llama" },
  { key: "mistral", label: "Mistral" },
  { key: "reasoning", label: "Reasoning", icon: <Brain size={11} /> },
  { key: "large_context", label: "1M Context", icon: <Layers size={11} /> },
];

export const ModelPickerModal: React.FC<ModelPickerModalProps> = ({
  open,
  onClose,
  models,
  selectedModel,
  onSelectModel,
  onRefreshModels,
  isRefreshing = false,
}) => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Persistent Pinned models
  const [pinnedModels, setPinnedModels] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(PINNED_STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_PINNED_MODELS;
    } catch {
      return DEFAULT_PINNED_MODELS;
    }
  });

  // Persistent Recent models
  const [recentModels, setRecentModels] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const togglePin = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedModels((prev) => {
      const next = prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId];
      try {
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSelect = (modelId: string) => {
    onSelectModel(modelId);
    // Add to recents
    setRecentModels((prev) => {
      const next = [modelId, ...prev.filter((id) => id !== modelId)].slice(0, 8);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    onClose();
  };

  // Extract unique providers for secondary dropdown
  const uniqueProviders = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) {
      if (m.owned_by) set.add(m.owned_by);
      if (m.id.includes("/")) set.add(m.id.split("/")[0]);
    }
    return Array.from(set).sort();
  }, [models]);

  // Filter models
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();

    return models.filter((m) => {
      const family = getModelFamily(m.id);
      const isPinned = pinnedModels.includes(m.id);

      // Category filter
      if (activeCategory === "recent" && !recentModels.includes(m.id)) return false;
      if (activeCategory === "pinned" && !isPinned) return false;
      if (activeCategory === "claude" && family.key !== "claude") return false;
      if (activeCategory === "gemini" && family.key !== "gemini") return false;
      if (activeCategory === "openai" && family.key !== "openai") return false;
      if (activeCategory === "deepseek" && family.key !== "deepseek") return false;
      if (activeCategory === "qwen" && family.key !== "qwen") return false;
      if (activeCategory === "llama" && family.key !== "llama") return false;
      if (activeCategory === "mistral" && family.key !== "mistral") return false;
      if (activeCategory === "reasoning" && !m.reasoning) return false;
      if (activeCategory === "large_context" && (!m.contextWindow || m.contextWindow < 1_000_000))
        return false;

      // Provider filter
      if (selectedProvider !== "all") {
        const prefix = m.id.includes("/") ? m.id.split("/")[0] : "combo";
        if (m.owned_by !== selectedProvider && prefix !== selectedProvider) {
          return false;
        }
      }

      // Search query
      if (q) {
        const idMatch = m.id.toLowerCase().includes(q);
        const nameMatch = formatModelDisplayName(m.id).toLowerCase().includes(q);
        const providerMatch = m.owned_by?.toLowerCase().includes(q);
        const familyMatch = family.label.toLowerCase().includes(q);
        const reasoningMatch = q === "reasoning" && m.reasoning;
        const ctxMatch =
          q.includes("1m") && m.contextWindow && m.contextWindow >= 1_000_000;
        return (
          idMatch ||
          nameMatch ||
          providerMatch ||
          familyMatch ||
          reasoningMatch ||
          ctxMatch
        );
      }

      return true;
    });
  }, [models, search, activeCategory, selectedProvider, pinnedModels]);

  // Auto focus search on open
  useEffect(() => {
    if (open) {
      setSearch("");
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Reset highlight index when filtered models change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search, activeCategory, selectedProvider]);

  // Keyboard Navigation: ArrowUp, ArrowDown, Enter, Escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredModels.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredModels[highlightedIndex]) {
          handleSelect(filteredModels[highlightedIndex].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filteredModels, highlightedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (!listContainerRef.current) return;
    const activeEl = listContainerRef.current.querySelector(
      `[data-index="${highlightedIndex}"]`
    ) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-16 px-3 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Dialog Box */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-[#141414] border border-[#2c2c2c] rounded-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] flex flex-col max-h-[85vh] overflow-hidden text-[#cccccc] font-sans"
      >
        {/* Top Header: Search input */}
        <div className="p-3.5 border-b border-[#242424] bg-[#181818] flex items-center gap-2.5">
          <div className="text-[#007acc] shrink-0 pl-1">
            <Search size={16} />
          </div>

          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Cari dari ${models.length} model... (misal: claude, gpt, gemini, reasoning, 1m)`}
            className="flex-1 bg-transparent text-sm text-white placeholder-[#666666] outline-none font-sans"
          />

          {search && (
            <button
              onClick={() => setSearch("")}
              className="p-1 rounded text-[#777777] hover:text-[#cccccc] hover:bg-[#252525] transition-colors"
            >
              <X size={14} />
            </button>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#222222] text-[#888888] border border-[#303030]">
              ESC tutup
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded text-[#888888] hover:text-white hover:bg-[#262626] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Category Filter Tabs & Host Selector */}
        <div className="px-3 bg-[#161616] border-b border-[#242424] flex items-center gap-2 h-11 shrink-0 overflow-hidden">
          {/* Horizontally scrollable tabs list */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden no-scrollbar py-1">
            {CATEGORY_TABS.map((tab) => {
              const isActive = activeCategory === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveCategory(tab.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium shrink-0 whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-[#252525] text-white border border-[#3e3e3e] shadow-sm"
                      : "text-[#888888] hover:text-[#dddddd] hover:bg-[#1e1e1e] border border-transparent"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.key === "all" && (
                    <span className="text-[10px] text-[#666666] font-mono">
                      {models.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sticky Pinned Provider selector on the right */}
          <div className="shrink-0 flex items-center gap-1.5 pl-2.5 border-l border-[#282828] bg-[#161616] h-7">
            <span className="text-[10px] font-mono text-[#666666] shrink-0">Host:</span>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="bg-[#1c1c1c] border border-[#2e2e2e] hover:border-[#404040] focus:border-[#007acc] rounded px-2 py-0.5 text-[11px] font-mono text-[#cccccc] outline-none cursor-pointer shrink-0"
            >
              <option value="all">Semua</option>
              {uniqueProviders.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Recent Models Bar if any */}
        {!search && activeCategory === "all" && recentModels.length > 0 && (
          <div className="px-3 bg-[#171717] border-b border-[#222222] flex items-center gap-2 h-9 shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar">
            <span className="text-[10px] uppercase font-mono text-[#666666] shrink-0 flex items-center gap-1">
              <Clock size={10} className="text-cyan-400" />
              <span>Terbaru:</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar py-1">
              {recentModels.map((mid: string) => {
                const fam = getModelFamily(mid);
                const disp = formatModelDisplayName(mid);
                return (
                  <button
                    key={mid}
                    type="button"
                    onClick={() => handleSelect(mid)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#1f1f1f] hover:bg-[#282828] border border-[#2e2e2e] text-[11px] text-[#cccccc] hover:text-white shrink-0 whitespace-nowrap transition-colors"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: fam.accentColor }}
                    />
                    <span className="truncate max-w-[130px]">{disp}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Model Results List */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto divide-y divide-[#1e1e1e] p-2 space-y-0.5 select-none"
        >
          {filteredModels.length === 0 ? (
            <div className="py-14 text-center">
              <Cpu size={32} className="mx-auto text-[#444444] mb-2" />
              <p className="text-sm font-medium text-[#aaaaaa]">
                Tidak ada model yang cocok
              </p>
              <p className="text-xs text-[#666666] mt-1">
                Coba ubah kata kunci pencarian atau ganti filter kategori
              </p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-3 px-3 py-1 rounded-md bg-[#222222] hover:bg-[#282828] text-xs text-[#cccccc] border border-[#333333] transition-colors"
                >
                  Hapus filter pencarian
                </button>
              )}
            </div>
          ) : (
            filteredModels.map((m, index) => {
              const family = getModelFamily(m.id);
              const isSelected = m.id === selectedModel;
              const isPinned = pinnedModels.includes(m.id);
              const isHighlighted = index === highlightedIndex;
              const ctxFormatted = formatContextWindow(m.contextWindow);
              const displayName = formatModelDisplayName(m.id);

              return (
                <div
                  key={m.id}
                  data-index={index}
                  onClick={() => handleSelect(m.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`group px-3 py-2.5 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[#1f2937]/35 border border-[#3b82f6]/40"
                      : isHighlighted
                      ? "bg-[#202020] border border-[#303030]"
                      : "hover:bg-[#1a1a1a] border border-transparent"
                  }`}
                >
                  {/* Left: Brand Badge & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Brand Pill Avatar */}
                    <div
                      className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 border text-[11px] font-bold uppercase tracking-wider ${family.badgeBg} ${family.badgeText} ${family.badgeBorder}`}
                      title={family.label}
                    >
                      {family.key === "claude" && <Sparkles size={13} />}
                      {family.key === "gemini" && <Zap size={13} />}
                      {family.key === "openai" && <Layers size={13} />}
                      {family.key === "deepseek" && <Flame size={13} />}
                      {family.key === "llama" && <Shield size={13} />}
                      {family.key === "mistral" && <Activity size={13} />}
                      {family.key === "qwen" && <Cpu size={13} />}
                      {family.key === "grok" && <Sparkles size={13} />}
                      {family.key === "other" && <Cpu size={13} />}
                    </div>

                    {/* Titles */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {displayName}
                        </span>

                        {/* Reasoning Tag */}
                        {m.reasoning && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-medium bg-[#1e293b] text-[#38bdf8] border border-[#0284c7]/40 shrink-0">
                            <Brain size={9} />
                            <span>Reasoning</span>
                          </span>
                        )}

                        {/* Vision Tag */}
                        {m.vision && (
                          <span
                            title="Mendukung input visual / gambar"
                            className="text-[#888888] hover:text-[#cccccc] shrink-0"
                          >
                            <Eye size={11} />
                          </span>
                        )}

                        {/* Tools Tag */}
                        {m.tools && (
                          <span
                            title="Mendukung tool call & function execution"
                            className="text-[#888888] hover:text-[#cccccc] shrink-0"
                          >
                            <Wrench size={11} />
                          </span>
                        )}
                      </div>

                      {/* Raw ID and Provider */}
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-[#777777] truncate">
                        <span className="text-[#999999] truncate">{m.id}</span>
                        {m.owned_by && (
                          <span className="px-1 rounded bg-[#181818] border border-[#282828] text-[#888888] shrink-0">
                            {m.owned_by}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Badges & Actions */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Context Window Tag */}
                    {ctxFormatted && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          m.contextWindow && m.contextWindow >= 1_000_000
                            ? "bg-[#1e1b4b]/40 text-[#a5b4fc] border-[#6366f1]/30 font-medium"
                            : "bg-[#1a1a1a] text-[#888888] border-[#2a2a2a]"
                        }`}
                      >
                        {ctxFormatted} ctx
                      </span>
                    )}

                    {/* Pin/Favorite Toggle Button */}
                    <button
                      type="button"
                      onClick={(e) => togglePin(m.id, e)}
                      title={isPinned ? "Hapus dari Favorit" : "Tandai sebagai Favorit"}
                      className={`p-1 rounded hover:bg-[#282828] transition-colors ${
                        isPinned
                          ? "text-amber-400"
                          : "text-[#555555] opacity-0 group-hover:opacity-100 hover:text-[#aaaaaa]"
                      }`}
                    >
                      <Star
                        size={13}
                        className={isPinned ? "fill-amber-400" : ""}
                      />
                    </button>

                    {/* Active Selected Checkmark */}
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-[#007acc]/20 border border-[#007acc] flex items-center justify-center text-[#38bdf8]">
                        <Check size={11} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Footer bar */}
        <div className="px-3.5 py-2.5 border-t border-[#242424] bg-[#161616] flex items-center justify-between text-xs text-[#777777]">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono">
              Menampilkan{" "}
              <strong className="text-white">{filteredModels.length}</strong>{" "}
              dari {models.length} model
            </span>

            {onRefreshModels && (
              <button
                onClick={onRefreshModels}
                disabled={isRefreshing}
                title="Muat ulang katalog dari 9Router"
                className="flex items-center gap-1 text-[11px] text-[#888888] hover:text-white transition-colors"
              >
                <RefreshCw
                  size={11}
                  className={isRefreshing ? "animate-spin text-[#007acc]" : ""}
                />
                <span>Refresh</span>
              </button>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-[#666666]">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-[#202020] border border-[#2e2e2e]">
                ↑
              </kbd>{" "}
              <kbd className="px-1 py-0.5 rounded bg-[#202020] border border-[#2e2e2e]">
                ↓
              </kbd>{" "}
              Navigasi
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-[#202020] border border-[#2e2e2e]">
                ↵
              </kbd>{" "}
              Pilih
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-[#202020] border border-[#2e2e2e]">
                ESC
              </kbd>{" "}
              Tutup
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ModelSelectorTriggerProps {
  selectedModel: string;
  models: RouterModel[];
  onClick: () => void;
  disabled?: boolean;
}

export const ModelSelectorTrigger: React.FC<ModelSelectorTriggerProps> = ({
  selectedModel,
  models,
  onClick,
  disabled = false,
}) => {
  const currentModel = useMemo(
    () => models.find((m) => m.id === selectedModel),
    [models, selectedModel]
  );

  const family = getModelFamily(selectedModel);
  const displayName = formatModelDisplayName(selectedModel);
  const ctx = formatContextWindow(currentModel?.contextWindow);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Model aktif: ${selectedModel} (Klik untuk mengganti model 9Router)`}
      className="group flex-1 min-w-0 bg-[#1a1a1a] hover:bg-[#202020] border border-[#2e2e2e] hover:border-[#444444] rounded-lg px-2.5 py-1 text-left flex items-center justify-between gap-2 transition-all cursor-pointer disabled:opacity-50"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Brand Dot / Icon */}
        <div
          className={`h-4 w-4 rounded flex items-center justify-center shrink-0 border text-[9px] font-bold ${family.badgeBg} ${family.badgeText} ${family.badgeBorder}`}
        >
          {family.label.charAt(0)}
        </div>

        {/* Model Name */}
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span className="text-[11px] font-medium text-white truncate">
            {displayName}
          </span>

          {currentModel?.reasoning && (
            <span
              title="Reasoning / Thinking Model"
              className="text-[#38bdf8] shrink-0"
            >
              <Brain size={11} />
            </span>
          )}
        </div>
      </div>

      {/* Right meta */}
      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono text-[#888888]">
        {ctx && (
          <span className="px-1.5 py-0.2 rounded bg-[#141414] border border-[#282828] text-[#aaaaaa]">
            {ctx}
          </span>
        )}
        <ChevronDown
          size={12}
          className="text-[#666666] group-hover:text-white transition-transform group-hover:translate-y-0.5"
        />
      </div>
    </button>
  );
};
