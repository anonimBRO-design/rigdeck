import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRigStore } from "../store/useRigStore";
import { GuiAppId, AgentRole } from "../types";
import {
  ExternalLink,
  Layers,
  Code2,
  ShieldCheck,
  Send,
  Play,
  FileCode2,
  FolderGit2,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Eye,
  Zap,
  BookOpen,
  Power,
  Bot,
  SlidersHorizontal,
} from "lucide-react";

import { createConductorTaskJson } from "../services/conductorAi";
import { appendMemory, syncObsidianDailyRecap } from "../services/sharedMemory";
import { soundFx } from "../services/soundFx";
import { SharedMemoryFeed } from "./SharedMemoryFeed";

const MEMORY_INSTRUCTION =
  "Sebelum mulai, baca AGENTS.md dan rig-memory/ (00-INDEX, 02-Decisions, journal terbaru). Setelah selesai, tulis ringkasan satu baris ke rig-memory/journal/ sesuai format di AGENTS.md.";

export const GuiControllerDeck: React.FC = () => {
  const {
    guiCards,
    updateGuiCard,
    toggleAgentEnabled,
    setHermesManualRole,
    setSelectedDiffTask,
    tasks,
    autoRelayEnabled,
    toggleAutoRelay,
    autoRelayStage,
    setAutoRelayStage,
  } = useRigStore();
  const [hudFeedback, setHudFeedback] = useState<string | null>(null);
  const [activeFocusing, setActiveFocusing] = useState<GuiAppId | null>(null);

  const showHud = (text: string) => {
    setHudFeedback(text);
    setTimeout(() => setHudFeedback(null), 3500);
  };

  const activeCount = Object.values(guiCards).filter((c) => c.enabled).length;

  const handleFocusWindow = async (appId: GuiAppId, appName: string) => {
    setActiveFocusing(appId);
    showHud(`Memfokuskan jendela ${appName}...`);

    try {
      await invoke("focus_gui_window", { appName: appId });
      showHud(`Jendela ${appName} berhasil difokuskan ke layar utama!`);
    } catch (err) {
      console.error("focus_gui_window gagal:", err);
      showHud(`Gagal fokuskan ${appName}: ${err}`);
    } finally {
      setTimeout(() => setActiveFocusing(null), 1200);
    }
  };

  const handleSendSpec = async () => {
    if (!guiCards.claude.enabled) return;
    try {
      const taskJson = createConductorTaskJson(
        "Misi Arsitektur RigDeck",
        guiCards.claude.currentTask || "Rancang arsitektur sistem dan spesifikasi teknis",
        guiCards.antigravity.currentTask,
        guiCards.chatgpt.currentTask
      );
      const jsonString = JSON.stringify(taskJson, null, 2);
      const promptText = `RigDeck Mission Control: rancang arsitektur sesuai file .rig/context/current_task.json. ${MEMORY_INSTRUCTION}`;

      await invoke("dispatch_claude_pointer_task", {
        taskPayloadJson: jsonString,
        prompt: promptText,
        autoSubmit: true,
      });

      await appendMemory("conductor", "handoff", `Spec dikirim ke claude: ${guiCards.claude.currentTask}`);

      updateGuiCard("claude", {
        status: "working",
        telemetryNote: "Spec dikirim langsung ke chat Claude Code",
      });
      soundFx.playRelayStep();
      if (autoRelayEnabled) {
        setAutoRelayStage("agy_coding");
      }
      showHud("Spec terkirim ke chat Claude Code & tiket ditulis ke context!");
    } catch (err) {
      console.warn("Could not dispatch pointer task via Tauri invoke:", err);
      showHud(`Gagal mengirim spec ke Claude: ${err}`);
    }
  };

  const handleRunCode = async () => {
    if (!guiCards.antigravity.enabled) return;
    try {
      const path = await invoke<string>("create_agent_worktree", { branch: "feat-impl" });
      const promptText = `Kerjakan di worktree ${path}: ${guiCards.antigravity.currentTask}. ${MEMORY_INSTRUCTION}`;

      const injected = await invoke<boolean>("inject_gui_prompt", {
        appName: "antigravity",
        prompt: promptText,
        autoSubmit: false,
      });

      await appendMemory("conductor", "handoff", `Tugas dikirim ke antigravity (worktree ${path}): ${guiCards.antigravity.currentTask}`);
      updateGuiCard("antigravity", {
        status: "working",
        artifactOrBranch: path,
        telemetryNote: injected
          ? "Worktree siap & prompt ditempel ke Antigravity"
          : "Worktree siap, tapi jendela Antigravity tidak ditemukan",
      });
      soundFx.playBuildSuccess();
      if (autoRelayEnabled) {
        setAutoRelayStage("codex_review");
      }
      showHud(
        injected
          ? "Antigravity difokuskan & prompt siap di editor!"
          : "Worktree siap, tapi jendela Antigravity tidak ditemukan. Prompt sudah disalin ke clipboard — buka Antigravity lalu Ctrl+V."
      );
    } catch (err) {
      console.error(err);
      showHud(`Gagal menyiapkan worktree: ${err}`);
    }
  };

  const handleAuditDiff = async () => {
    if (!guiCards.chatgpt.enabled) return;
    const targetTask = tasks.find((t) => t.id === "task-101") || tasks[0];
    if (targetTask) {
      setSelectedDiffTask(targetTask);
    }
    const promptText = `Audit review git diff untuk branch ${guiCards.antigravity.artifactOrBranch || "feat-impl"}:\n- Periksa potensi secret leakage\n- Validasi edge-case handling\n- Evaluasi efisiensi memori & async concurrency\n\n${MEMORY_INSTRUCTION}`;

    try {
      await invoke("inject_gui_prompt", {
        appName: "chatgpt",
        prompt: promptText,
        autoSubmit: false,
      });

      await appendMemory("conductor", "handoff", `Review diff diminta ke chatgpt: ${guiCards.chatgpt.currentTask}`);
      updateGuiCard("chatgpt", {
        status: "reviewing",
        telemetryNote: "Diff prompt ditempel ke ChatGPT",
      });
      soundFx.playMissionComplete();
      if (autoRelayEnabled) {
        setAutoRelayStage("ready_merge");
      }
      showHud("Membuka Diff Viewer & menempelkan prompt ke ChatGPT!");
    } catch (err) {
      console.error(err);
      showHud(`Gagal memfokuskan ChatGPT: ${err}`);
    }
  };

  const handleRunHermes = async () => {
    if (!guiCards.hermes.enabled) return;
    try {
      const roleStr = guiCards.hermes.role.toLowerCase();
      let promptText = "";

      if (roleStr.includes("architect")) {
        promptText = `RigDeck Mission Control (Adaptive Hermes): Rancang arsitektur & spesifikasi teknis untuk tugas: ${guiCards.hermes.currentTask}. ${MEMORY_INSTRUCTION}`;
      } else if (roleStr.includes("coder")) {
        const path = await invoke<string>("create_agent_worktree", { branch: "feat-hermes-impl" });
        promptText = `Kerjakan di worktree ${path}: ${guiCards.hermes.currentTask}. ${MEMORY_INSTRUCTION}`;
        updateGuiCard("hermes", { artifactOrBranch: path });
      } else if (roleStr.includes("reviewer")) {
        promptText = `Audit review git diff & uji keamanan: ${guiCards.hermes.currentTask}. Periksa secret leak & handling edge case. ${MEMORY_INSTRUCTION}`;
        const targetTask = tasks.find((t) => t.id === "task-101") || tasks[0];
        if (targetTask) setSelectedDiffTask(targetTask);
      } else {
        promptText = `RigDeck Co-Pilot (Hermes): Jalankan tugas adaptif: ${guiCards.hermes.currentTask}. ${MEMORY_INSTRUCTION}`;
      }

      const injected = await invoke<boolean>("inject_gui_prompt", {
        appName: "hermes",
        prompt: promptText,
        autoSubmit: false,
      });

      await appendMemory("hermes", "progress", `Hermes menjalankan tugas adaptif: ${guiCards.hermes.currentTask}`);
      updateGuiCard("hermes", {
        status: "working",
        telemetryNote: injected ? "Prompt ditempel ke Hermes" : "Prompt disalin ke clipboard",
      });
      soundFx.playBuildSuccess();
      showHud(
        injected
          ? "Jendela Hermes difokuskan & prompt siap!"
          : "Prompt disalin ke clipboard — buka jendela Hermes lalu tekan Ctrl+V."
      );
    } catch (err) {
      console.error(err);
      showHud(`Gagal mengeksekusi aksi Hermes: ${err}`);
    }
  };

  const handleSyncObsidianRecap = async () => {
    try {
      await syncObsidianDailyRecap({
        missionTitle: "Multi-Agent Collaboration Sprint",
        summary: `Sprint kolaborasi selesai. Claude merancang arsitektur, Agy mengimplementasikan kode di branch ${guiCards.antigravity.artifactOrBranch || "feat-impl"}, Codex mengaudit diff, dan Hermes mendukung peran adaptif.`,
        claudeTask: guiCards.claude.enabled ? guiCards.claude.currentTask : "(OFF)",
        antigravityTask: guiCards.antigravity.enabled ? guiCards.antigravity.currentTask : "(OFF)",
        chatgptTask: guiCards.chatgpt.enabled ? guiCards.chatgpt.currentTask : "(OFF)",
        hermesTask: guiCards.hermes.enabled ? `${guiCards.hermes.role} - ${guiCards.hermes.currentTask}` : "(OFF)",
        branch: guiCards.antigravity.artifactOrBranch,
      });
      soundFx.playMissionComplete();
      showHud("Daily Dev Recap berhasil disinkronkan ke Obsidian (rig-memory/journal/)!");
    } catch (err) {
      showHud(`Gagal sync Obsidian: ${err}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#121212] overflow-hidden select-none relative">
      {/* Top Floating HUD Toast */}
      {hudFeedback && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded bg-[#222222] border border-[#383838] text-[#f0f0f0] font-mono text-xs shadow-lg flex items-center gap-2">
          <Sparkles size={12} className="text-[#007acc]" />
          <span>{hudFeedback}</span>
        </div>
      )}

      {/* Controller Deck Top Bar */}
      <div className="h-10 border-b border-[#242424] bg-[#181818] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-[#222222] border border-[#303030] flex items-center justify-center text-[#007acc]">
            <Zap size={13} />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-white tracking-wide">
              Desktop GUI Controller
            </h2>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#202020] text-[#10b981] border border-[#2e2e2e]">
              {activeCount}/4 Active
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            if (guiCards.claude.enabled) handleFocusWindow("claude", "Mas Claude");
            if (guiCards.antigravity.enabled) setTimeout(() => handleFocusWindow("antigravity", "Mbak Agy"), 300);
            if (guiCards.chatgpt.enabled) setTimeout(() => handleFocusWindow("chatgpt", "Bg Codex"), 600);
            if (guiCards.hermes.enabled) setTimeout(() => handleFocusWindow("hermes", "Hermes Agent"), 900);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-[#222222] hover:bg-[#282828] text-[#cccccc] border border-[#303030] transition-colors"
        >
          <RefreshCw size={11} className="text-[#888888]" />
          <span className="text-[11px]">Tile Windows</span>
        </button>
      </div>

      {/* Auto-Relay Pipeline & Obsidian Sync Sub-Bar */}
      <div className="h-9 px-4 bg-[#141414] border-b border-[#242424] flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Toggle Button */}
          <button
            onClick={() => {
              soundFx.playClick();
              toggleAutoRelay();
            }}
            title={autoRelayEnabled ? "Auto-Relay Aktif (Klik untuk nonaktifkan)" : "Aktifkan Auto-Relay Handover"}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-medium border transition-colors ${
              autoRelayEnabled
                ? "bg-[#16291c] text-[#10b981] border-[#22442c]"
                : "bg-[#1e1e1e] text-[#888888] border-[#2c2c2c] hover:text-[#cccccc]"
            }`}
          >
            <Zap size={11} className={autoRelayEnabled ? "text-[#10b981] fill-[#10b981]" : ""} />
            <span>⚡ Auto-Relay: {autoRelayEnabled ? "ACTIVE" : "OFF"}</span>
          </button>

          {/* Pipeline Step Flow Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-[#666666]">
            <span
              className={`px-2 py-0.5 rounded border transition-colors ${
                autoRelayStage === "claude_spec"
                  ? "bg-[#2a1f14] text-[#d97706] font-medium border-[#3e2c1a]"
                  : "border-transparent"
              } ${!guiCards.claude.enabled ? "opacity-50 line-through" : ""}`}
            >
              ① {guiCards.claude.enabled ? "Mas Claude" : guiCards.hermes.role.includes("Architect") ? "🟣 Hermes" : "Claude (OFF)"}
            </span>
            <span>→</span>
            <span
              className={`px-2 py-0.5 rounded border transition-colors ${
                autoRelayStage === "agy_coding"
                  ? "bg-[#142333] text-[#007acc] font-medium border-[#1b354e]"
                  : "border-transparent"
              } ${!guiCards.antigravity.enabled ? "opacity-50 line-through" : ""}`}
            >
              ② {guiCards.antigravity.enabled ? "Mbak Agy" : guiCards.hermes.role.includes("Coder") ? "🟣 Hermes" : "Agy (OFF)"}
            </span>
            <span>→</span>
            <span
              className={`px-2 py-0.5 rounded border transition-colors ${
                autoRelayStage === "codex_review"
                  ? "bg-[#14261c] text-[#10b981] font-medium border-[#1c3826]"
                  : "border-transparent"
              } ${!guiCards.chatgpt.enabled ? "opacity-50 line-through" : ""}`}
            >
              ③ {guiCards.chatgpt.enabled ? "Bg Codex" : guiCards.hermes.role.includes("Reviewer") ? "🟣 Hermes" : "Codex (OFF)"}
            </span>
            <span>→</span>
            <span
              className={`px-2 py-0.5 rounded border transition-colors ${
                autoRelayStage === "ready_merge"
                  ? "bg-[#10b981] text-black font-semibold border-[#10b981] animate-pulse"
                  : "border-transparent"
              }`}
            >
              ④ Ready to Merge
            </span>
          </div>
        </div>

        {/* Sync Obsidian Recap Button */}
        <button
          onClick={handleSyncObsidianRecap}
          title="Tulis Daily Dev Recap ke rig-memory/journal/ (Obsidian Vault)"
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium text-[#cccccc] bg-[#1e1e1e] hover:bg-[#262626] border border-[#2c2c2c] transition-colors"
        >
          <BookOpen size={11} className="text-[#a0a0a0]" />
          <span>Sync Obsidian</span>
        </button>
      </div>

      {/* Main Deck Container: 4 Cards Responsive Grid */}
      <div className="flex-1 p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 overflow-y-auto items-stretch">
        {/* ========================================================================= */}
        {/* 🟠 CARD 1: CLAUDE DESKTOP (THE ARCHITECT)                                 */}
        {/* ========================================================================= */}
        <div
          className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
            guiCards.claude.enabled
              ? "border-[#282828] hover:border-[#383838] bg-[#181818]"
              : "border-[#202020] bg-[#141414] opacity-60"
          }`}
        >
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#222222] border border-[#303030] flex items-center justify-center text-[#d97706]">
                  <Layers size={17} />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    {guiCards.claude.name}
                  </h3>
                  <span className="text-[11px] font-medium text-[#d97706]">
                    {guiCards.claude.role}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => {
                  toggleAgentEnabled("claude");
                  showHud(`Mas Claude ${guiCards.claude.enabled ? "dinonaktifkan (OFF)" : "diaktifkan (ON)"}`);
                }}
                title={guiCards.claude.enabled ? "Klik untuk mematikan Mas Claude" : "Klik untuk menyalakan Mas Claude"}
                className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all border ${
                  guiCards.claude.enabled
                    ? "bg-[#1a2e20] text-[#10b981] border-[#254d30] hover:bg-[#203a28]"
                    : "bg-[#2d1b1b] text-[#f87171] border-[#4a2626] hover:bg-[#382020]"
                }`}
              >
                <Power size={10} />
                <span>{guiCards.claude.enabled ? "ON" : "OFF"}</span>
              </button>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#666666] block mb-1">
                Tugas Delegasi:
              </span>
              <div className="p-2.5 rounded-lg bg-[#141414] border border-[#242424] text-xs text-[#cccccc] leading-relaxed min-h-[60px] flex items-center">
                <p>{guiCards.claude.enabled ? guiCards.claude.currentTask : "Agen nonaktif — peran dialihkan secara adaptif ke Hermes."}</p>
              </div>
            </div>

            {/* Artifact & Telemetry Note */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777777]">
                <span className="flex items-center gap-1.5">
                  <FileCode2 size={11} className="text-[#888888]" />
                  Artifact RFC:
                </span>
                <span className="text-[#cccccc] truncate max-w-[130px]">
                  {guiCards.claude.artifactOrBranch}
                </span>
              </div>

              {guiCards.claude.telemetryNote && (
                <div className="text-[10px] font-mono text-[#10b981] flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  <span>{guiCards.claude.telemetryNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-3 border-t border-[#242424] flex items-center gap-2">
            <button
              onClick={() => handleFocusWindow("claude", "Mas Claude")}
              disabled={!guiCards.claude.enabled}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                activeFocusing === "claude"
                  ? "bg-[#282828] text-white border-[#444444]"
                  : "bg-[#202020] hover:bg-[#262626] text-[#cccccc] border-[#2e2e2e]"
              }`}
            >
              <ExternalLink size={12} />
              <span>Focus Window</span>
            </button>

            <button
              onClick={handleSendSpec}
              disabled={!guiCards.claude.enabled}
              className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#282828] hover:bg-[#303030] text-white border border-[#3a3a3a] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={12} />
              <span>Send Spec</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 🔵 CARD 2: ANTIGRAVITY (THE CODER & OS)                                   */}
        {/* ========================================================================= */}
        <div
          className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
            guiCards.antigravity.enabled
              ? "border-[#282828] hover:border-[#383838] bg-[#181818]"
              : "border-[#202020] bg-[#141414] opacity-60"
          }`}
        >
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#222222] border border-[#303030] flex items-center justify-center text-[#007acc]">
                  <Code2 size={17} />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    {guiCards.antigravity.name}
                  </h3>
                  <span className="text-[11px] font-medium text-[#007acc]">
                    {guiCards.antigravity.role}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => {
                  toggleAgentEnabled("antigravity");
                  showHud(`Mbak Agy ${guiCards.antigravity.enabled ? "dinonaktifkan (OFF)" : "diaktifkan (ON)"}`);
                }}
                title={guiCards.antigravity.enabled ? "Klik untuk mematikan Mbak Agy" : "Klik untuk menyalakan Mbak Agy"}
                className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all border ${
                  guiCards.antigravity.enabled
                    ? "bg-[#1a2e20] text-[#10b981] border-[#254d30] hover:bg-[#203a28]"
                    : "bg-[#2d1b1b] text-[#f87171] border-[#4a2626] hover:bg-[#382020]"
                }`}
              >
                <Power size={10} />
                <span>{guiCards.antigravity.enabled ? "ON" : "OFF"}</span>
              </button>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#666666] block mb-1">
                Tugas Delegasi:
              </span>
              <div className="p-2.5 rounded-lg bg-[#141414] border border-[#242424] text-xs text-[#cccccc] leading-relaxed min-h-[60px] flex items-center">
                <p>{guiCards.antigravity.enabled ? guiCards.antigravity.currentTask : "Agen nonaktif — peran dialihkan secara adaptif ke Hermes."}</p>
              </div>
            </div>

            {/* Artifact & Worktree Info */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777777]">
                <span className="flex items-center gap-1.5">
                  <FolderGit2 size={11} className="text-[#888888]" />
                  Git Worktree:
                </span>
                <span className="text-[#cccccc] truncate max-w-[130px]">
                  {guiCards.antigravity.artifactOrBranch}
                </span>
              </div>

              {guiCards.antigravity.telemetryNote && (
                <div className="text-[10px] font-mono text-[#10b981] flex items-center gap-1">
                  <Zap size={10} />
                  <span>{guiCards.antigravity.telemetryNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-3 border-t border-[#242424] flex items-center gap-2">
            <button
              onClick={() => handleFocusWindow("antigravity", "Mbak Agy")}
              disabled={!guiCards.antigravity.enabled}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                activeFocusing === "antigravity"
                  ? "bg-[#282828] text-white border-[#444444]"
                  : "bg-[#202020] hover:bg-[#262626] text-[#cccccc] border-[#2e2e2e]"
              }`}
            >
              <ExternalLink size={12} />
              <span>Focus Window</span>
            </button>

            <button
              onClick={handleRunCode}
              disabled={!guiCards.antigravity.enabled}
              className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#282828] hover:bg-[#303030] text-white border border-[#3a3a3a] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={12} />
              <span>Run Code</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ⚪ CARD 3: CHATGPT DESKTOP (THE REVIEWER)                                  */}
        {/* ========================================================================= */}
        <div
          className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
            guiCards.chatgpt.enabled
              ? "border-[#282828] hover:border-[#383838] bg-[#181818]"
              : "border-[#202020] bg-[#141414] opacity-60"
          }`}
        >
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#222222] border border-[#303030] flex items-center justify-center text-[#10b981]">
                  <ShieldCheck size={17} />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    {guiCards.chatgpt.name}
                  </h3>
                  <span className="text-[11px] font-medium text-[#10b981]">
                    {guiCards.chatgpt.role}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => {
                  toggleAgentEnabled("chatgpt");
                  showHud(`Bg Codex ${guiCards.chatgpt.enabled ? "dinonaktifkan (OFF)" : "diaktifkan (ON)"}`);
                }}
                title={guiCards.chatgpt.enabled ? "Klik untuk mematikan Bg Codex" : "Klik untuk menyalakan Bg Codex"}
                className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all border ${
                  guiCards.chatgpt.enabled
                    ? "bg-[#1a2e20] text-[#10b981] border-[#254d30] hover:bg-[#203a28]"
                    : "bg-[#2d1b1b] text-[#f87171] border-[#4a2626] hover:bg-[#382020]"
                }`}
              >
                <Power size={10} />
                <span>{guiCards.chatgpt.enabled ? "ON" : "OFF"}</span>
              </button>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#666666] block mb-1">
                Tugas Delegasi:
              </span>
              <div className="p-2.5 rounded-lg bg-[#141414] border border-[#242424] text-xs text-[#cccccc] leading-relaxed min-h-[60px] flex items-center">
                <p>{guiCards.chatgpt.enabled ? guiCards.chatgpt.currentTask : "Agen nonaktif — peran dialihkan secara adaptif ke Hermes."}</p>
              </div>
            </div>

            {/* Artifact & Security Score */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777777]">
                <span className="flex items-center gap-1.5">
                  <FileCode2 size={11} className="text-[#888888]" />
                  Target Diff:
                </span>
                <span className="text-[#cccccc] truncate max-w-[130px]">
                  {guiCards.chatgpt.artifactOrBranch}
                </span>
              </div>

              {guiCards.chatgpt.telemetryNote && (
                <div className="text-[10px] font-mono text-[#10b981] flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  <span>{guiCards.chatgpt.telemetryNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-3 border-t border-[#242424] flex items-center gap-2">
            <button
              onClick={() => handleFocusWindow("chatgpt", "Bg Codex")}
              disabled={!guiCards.chatgpt.enabled}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                activeFocusing === "chatgpt"
                  ? "bg-[#282828] text-white border-[#444444]"
                  : "bg-[#202020] hover:bg-[#262626] text-[#cccccc] border-[#2e2e2e]"
              }`}
            >
              <ExternalLink size={12} />
              <span>Focus Window</span>
            </button>

            <button
              onClick={handleAuditDiff}
              disabled={!guiCards.chatgpt.enabled}
              className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#282828] hover:bg-[#303030] text-white border border-[#3a3a3a] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Eye size={12} />
              <span>Audit Diff</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 🟣 CARD 4: HERMES (THE ADAPTIVE CO-PILOT)                                  */}
        {/* ========================================================================= */}
        <div
          className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
            guiCards.hermes.enabled
              ? "border-[#38264e] hover:border-[#523377] bg-[#1a1424]"
              : "border-[#202020] bg-[#141414] opacity-60"
          }`}
        >
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#271b38] border border-[#442c62] flex items-center justify-center text-[#c084fc]">
                  <Bot size={17} />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>{guiCards.hermes.name}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-[#351e50] text-[#d8b4fe] border border-[#522b7a]">
                      FLEX
                    </span>
                  </h3>
                  <span className="text-[11px] font-medium text-[#c084fc] block truncate max-w-[150px]">
                    {guiCards.hermes.role}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => {
                  toggleAgentEnabled("hermes");
                  showHud(`Hermes ${guiCards.hermes.enabled ? "dinonaktifkan (OFF)" : "diaktifkan (ON)"}`);
                }}
                title={guiCards.hermes.enabled ? "Klik untuk mematikan Hermes" : "Klik untuk menyalakan Hermes"}
                className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all border ${
                  guiCards.hermes.enabled
                    ? "bg-[#281b3d] text-[#c084fc] border-[#4c2d79] hover:bg-[#342252]"
                    : "bg-[#2d1b1b] text-[#f87171] border-[#4a2626] hover:bg-[#382020]"
                }`}
              >
                <Power size={10} />
                <span>{guiCards.hermes.enabled ? "ON" : "OFF"}</span>
              </button>
            </div>

            {/* Quick Manual Role Switcher */}
            <div className="mt-2.5 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[9px] font-mono text-[#888888] flex items-center gap-1 mr-0.5">
                <SlidersHorizontal size={9} />
                Role:
              </span>
              {[
                { label: "Auto", val: null },
                { label: "Arch", val: "architect" as AgentRole },
                { label: "Coder", val: "coder" as AgentRole },
                { label: "Review", val: "reviewer" as AgentRole },
                { label: "Co-Pilot", val: "copilot" as AgentRole },
              ].map((r) => {
                const isActive = guiCards.hermes.manualRoleOverride === r.val;
                return (
                  <button
                    key={r.label}
                    onClick={() => {
                      setHermesManualRole(r.val);
                      showHud(`Peran Hermes: ${r.label}`);
                    }}
                    className={`px-1.5 py-0.2 text-[9px] font-mono rounded border transition-colors ${
                      isActive
                        ? "bg-[#4c227e] text-white border-[#7a39c9] font-semibold"
                        : "bg-[#181124] text-[#999999] border-[#291b3b] hover:text-[#cccccc]"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* Active Delegated Task */}
            <div className="mt-2.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#999999] block mb-1">
                Tugas Delegasi:
              </span>
              <div className="p-2.5 rounded-lg bg-[#130d1c] border border-[#2d1b40] text-xs text-[#ddccf5] leading-relaxed min-h-[60px] flex items-center">
                <p>{guiCards.hermes.enabled ? guiCards.hermes.currentTask : "Hermes nonaktif."}</p>
              </div>
            </div>

            {/* Artifact & Telemetry Note */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#888888]">
                <span className="flex items-center gap-1.5">
                  <FileCode2 size={11} className="text-[#a855f7]" />
                  Status Adaptif:
                </span>
                <span className="text-[#d8b4fe] truncate max-w-[130px]">
                  {guiCards.hermes.manualRoleOverride ? "Manual Override" : "Auto-Covering"}
                </span>
              </div>

              {guiCards.hermes.telemetryNote && (
                <div className="text-[10px] font-mono text-[#c084fc] flex items-center gap-1">
                  <Zap size={10} />
                  <span>{guiCards.hermes.telemetryNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-3 border-t border-[#2d1b40] flex items-center gap-2">
            <button
              onClick={() => handleFocusWindow("hermes", "Hermes Agent")}
              disabled={!guiCards.hermes.enabled}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                activeFocusing === "hermes"
                  ? "bg-[#3c225f] text-white border-[#61369b]"
                  : "bg-[#25163b] hover:bg-[#301c4c] text-[#d8b4fe] border-[#39215b]"
              }`}
            >
              <ExternalLink size={12} />
              <span>Focus Window</span>
            </button>

            <button
              onClick={handleRunHermes}
              disabled={!guiCards.hermes.enabled}
              className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#4a227b] hover:bg-[#5b2997] text-white border border-[#6b35af] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={12} />
              <span>Action</span>
            </button>
          </div>
        </div>
      </div>

      {/* Shared Memory Feed — journal bersama 4 AI */}
      <SharedMemoryFeed />
    </div>
  );
};

export default GuiControllerDeck;
