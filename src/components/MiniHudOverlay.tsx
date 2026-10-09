import React from "react";
import { useRigStore } from "../store/useRigStore";
import { soundFx } from "../services/soundFx";
import {
  Layers,
  Code2,
  ShieldCheck,
  Maximize2,
  Volume2,
  VolumeX,
  Zap,
  Leaf,
  Flame,
} from "lucide-react";

interface MiniHudOverlayProps {
  onExpand: () => void;
}

export const MiniHudOverlay: React.FC<MiniHudOverlayProps> = ({ onExpand }) => {
  const {
    guiCards,
    ecoMode,
    toggleEcoMode,
    audioEnabled,
    toggleAudio,
    autoRelayEnabled,
    toggleAutoRelay,
    autoRelayStage,
    sessionTokens,
  } = useRigStore();

  const stageLabels: Record<string, { label: string; color: string }> = {
    idle: { label: "Standby", color: "text-[#888888] bg-[#1a1a1a]" },
    claude_spec: { label: "Mas Claude (Spec)", color: "text-[#d97706] bg-[#2a1f14]" },
    agy_coding: { label: "Mbak Agy (Coding)", color: "text-[#007acc] bg-[#142333]" },
    codex_review: { label: "Bg Codex (Review)", color: "text-[#10b981] bg-[#14261c]" },
    ready_merge: { label: "Ready to Merge", color: "text-[#10b981] bg-[#14261c] border-[#10b981]" },
  };

  const currentStage = stageLabels[autoRelayStage] || stageLabels.idle;

  return (
    <aside
      aria-label="RigDeck Mini HUD Overlay"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-[#141414]/95 backdrop-blur-md border border-[#2c2c2c] shadow-2xl text-xs select-none animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      {/* Brand & Expand */}
      <div className="flex items-center gap-2 pr-2 border-r border-[#262626]">
        <div className="h-6 w-6 rounded-lg bg-[#222222] border border-[#333333] flex items-center justify-center font-bold text-[11px] text-[#007acc]">
          RD
        </div>
        <span className="font-semibold text-white tracking-tight text-[11px] hidden sm:inline">
          HUD
        </span>
      </div>

      {/* Auto-Relay Pipeline Pill */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            soundFx.playClick();
            toggleAutoRelay();
          }}
          title={autoRelayEnabled ? "Auto-Relay Aktif (Klik untuk pause)" : "Aktifkan Auto-Relay"}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono font-medium transition-colors border ${
            autoRelayEnabled
              ? "bg-[#1c2820] text-[#10b981] border-[#22442c]"
              : "bg-[#1a1a1a] text-[#888888] border-[#282828] hover:text-[#cccccc]"
          }`}
        >
          <Zap size={11} className={autoRelayEnabled ? "text-[#10b981] fill-[#10b981]" : ""} />
          <span>Relay: {currentStage.label}</span>
        </button>
      </div>

      {/* 3 Agents Status Strip */}
      <div className="flex items-center gap-2 px-2 border-x border-[#262626]">
        {/* Mas Claude */}
        <div
          title={`Mas Claude: ${guiCards.claude.status} • ${guiCards.claude.currentTask}`}
          className="flex items-center gap-1 text-[11px]"
        >
          <Layers size={13} className="text-[#d97706]" />
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              guiCards.claude.status === "working"
                ? "bg-[#d97706] animate-pulse"
                : guiCards.claude.status === "ready"
                ? "bg-[#10b981]"
                : "bg-[#555555]"
            }`}
          />
        </div>

        {/* Mbak Agy */}
        <div
          title={`Mbak Agy: ${guiCards.antigravity.status} • ${guiCards.antigravity.currentTask}`}
          className="flex items-center gap-1 text-[11px]"
        >
          <Code2 size={13} className="text-[#007acc]" />
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              guiCards.antigravity.status === "working"
                ? "bg-[#007acc] animate-pulse"
                : "bg-[#555555]"
            }`}
          />
        </div>

        {/* Bg Codex */}
        <div
          title={`Bg Codex: ${guiCards.chatgpt.status} • ${guiCards.chatgpt.currentTask}`}
          className="flex items-center gap-1 text-[11px]"
        >
          <ShieldCheck size={13} className="text-[#10b981]" />
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              guiCards.chatgpt.status === "reviewing"
                ? "bg-[#10b981] animate-pulse"
                : "bg-[#555555]"
            }`}
          />
        </div>
      </div>

      {/* Quota Radar Pill */}
      <button
        onClick={() => {
          soundFx.playClick();
          toggleEcoMode();
        }}
        title={`Mode Kuota: ${ecoMode ? "Eco Mode (Hemat Token)" : "Max Reasoning (Opus/GPT-5)"}`}
        className="flex items-center gap-1 text-[11px] font-mono text-[#888888] hover:text-[#cccccc] transition-colors"
      >
        {ecoMode ? (
          <Leaf size={11} className="text-[#10b981]" />
        ) : (
          <Flame size={11} className="text-[#f59e0b]" />
        )}
        <span className="text-[10px]">{Math.round(sessionTokens / 1000)}k tok</span>
      </button>

      {/* Sound Toggle */}
      <button
        onClick={() => {
          const next = toggleAudio();
          if (next) soundFx.playClick();
        }}
        title={audioEnabled ? "Efek Suara Aktif (Klik untuk mute)" : "Efek Suara Hening"}
        className="p-1 rounded text-[#777777] hover:text-[#cccccc] hover:bg-[#202020] transition-colors"
      >
        {audioEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
      </button>

      {/* Expand Button */}
      <button
        onClick={() => {
          soundFx.playClick();
          onExpand();
        }}
        title="Kembali ke Layar Penuh Mission Control"
        className="p-1 rounded bg-[#222222] hover:bg-[#2c2c2c] text-white border border-[#333333] transition-colors"
      >
        <Maximize2 size={12} />
      </button>
    </aside>
  );
};
