import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRigStore } from "../store/useRigStore";
import { GuiAppId } from "../types";
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
} from "lucide-react";

import { createConductorTaskJson } from "../services/conductorAi";
import { appendMemory } from "../services/sharedMemory";
import { SharedMemoryFeed } from "./SharedMemoryFeed";

const MEMORY_INSTRUCTION =
  "Sebelum mulai, baca AGENTS.md dan rig-memory/ (00-INDEX, 02-Decisions, journal terbaru). Setelah selesai, tulis ringkasan satu baris ke rig-memory/journal/ sesuai format di AGENTS.md.";

export const GuiControllerDeck: React.FC = () => {
  const { guiCards, updateGuiCard, setSelectedDiffTask, tasks } = useRigStore();
  const [hudFeedback, setHudFeedback] = useState<string | null>(null);
  const [activeFocusing, setActiveFocusing] = useState<GuiAppId | null>(null);

  const showHud = (text: string) => {
    setHudFeedback(text);
    setTimeout(() => setHudFeedback(null), 3500);
  };

  const handleFocusWindow = async (appId: GuiAppId, appName: string) => {
    setActiveFocusing(appId);
    showHud(`Mengirim sinyal wmctrl untuk memfokuskan jendela ${appName}...`);

    try {
      await invoke("focus_gui_window", { appName: appId });
      showHud(`Jendela ${appName} berhasil difokuskan ke layar utama!`);
    } catch {
      // Fallback in web browser mode
      showHud(`[Dev Mode] Jendela ${appName} aktif via X11/Wayland bridge.`);
    } finally {
      setTimeout(() => setActiveFocusing(null), 1200);
    }
  };

  const handleSendSpec = async () => {
    try {
      const taskJson = createConductorTaskJson(
        "Misi Arsitektur RigDeck",
        guiCards.claude.currentTask || "Rancang arsitektur sistem dan spesifikasi teknis",
        guiCards.antigravity.currentTask,
        guiCards.chatgpt.currentTask
      );
      const jsonString = JSON.stringify(taskJson, null, 2);

      // 1. Write pointer context file & dispatch deep-link to Claude Desktop
      await invoke("dispatch_claude_pointer_task", { taskPayloadJson: jsonString });

      // 2. Also copy pointer prompt to clipboard for user convenience
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `RigDeck Mission Control: rancang arsitektur sesuai file .rig/context/current_task.json. ${MEMORY_INSTRUCTION}`
        );
      }

      await appendMemory("conductor", "handoff", `Spec dikirim ke claude: ${guiCards.claude.currentTask}`);

      updateGuiCard("claude", {
        status: "working",
        telemetryNote: ".rig/context/current_task.json dikirim via deep-link & clipboard",
      });
      showHud("Tiket ditulis ke .rig/context/current_task.json & Claude Desktop difokuskan!");
    } catch (err) {
      console.warn("Could not dispatch pointer task via Tauri invoke:", err);
      showHud(`Gagal mengirim spec ke Claude: ${err}`);
    }
  };

  const handleRunCode = async () => {
    await handleFocusWindow("antigravity", "Antigravity");
    try {
      const path = await invoke<string>("create_agent_worktree", { branch: "feat-impl" });
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `Kerjakan di worktree ${path}: ${guiCards.antigravity.currentTask}. ${MEMORY_INSTRUCTION}`
        );
      }
      await appendMemory("conductor", "handoff", `Tugas dikirim ke antigravity (worktree ${path}): ${guiCards.antigravity.currentTask}`);
      updateGuiCard("antigravity", {
        status: "working",
        artifactOrBranch: path,
        telemetryNote: "Worktree siap, prompt disalin ke clipboard",
      });
      showHud("Antigravity difokuskan, worktree siap & prompt disalin ke clipboard!");
    } catch (err) {
      console.error(err);
      showHud(`Gagal menyiapkan worktree: ${err}`);
    }
  };

  const handleAuditDiff = async () => {
    const targetTask = tasks.find((t) => t.id === "task-101") || tasks[0];
    if (targetTask) {
      setSelectedDiffTask(targetTask);
    }
    // Focus ChatGPT Desktop
    await handleFocusWindow("chatgpt", "ChatGPT Desktop");
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(
        `Audit review git diff untuk branch ${guiCards.antigravity.artifactOrBranch || "feat-impl"}:\n- Periksa potensi secret leakage\n- Validasi edge-case handling\n- Evaluasi efisiensi memori & async concurrency\n\n${MEMORY_INSTRUCTION}`
      );
    }
    await appendMemory("conductor", "handoff", `Review diff diminta ke chatgpt: ${guiCards.chatgpt.currentTask}`);
    updateGuiCard("chatgpt", {
      status: "reviewing",
      telemetryNote: "Diff prompt disalin ke clipboard & ChatGPT difokuskan",
    });
    showHud("Membuka 3-Way Diff Viewer & memfokuskan ChatGPT Desktop!");
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
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#202020] text-[#888888] border border-[#2e2e2e]">
              3 Connected
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            handleFocusWindow("claude", "Claude Desktop");
            setTimeout(() => handleFocusWindow("antigravity", "Antigravity"), 300);
            setTimeout(() => handleFocusWindow("chatgpt", "ChatGPT Desktop"), 600);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-[#222222] hover:bg-[#282828] text-[#cccccc] border border-[#303030] transition-colors"
        >
          <RefreshCw size={11} className="text-[#888888]" />
          <span className="text-[11px]">Tile Windows</span>
        </button>
      </div>

      {/* Main Deck Container: 3 Flat Clean Cards */}
      <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-3 gap-3.5 overflow-y-auto items-stretch">
        {/* ========================================================================= */}
        {/* 🟠 CARD 1: CLAUDE DESKTOP (THE ARCHITECT)                                 */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between rounded-xl border border-[#282828] hover:border-[#383838] bg-[#181818] p-4 transition-colors">
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

              {/* Status Pill */}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#202020] text-[#a0a0a0] border border-[#2c2c2c] uppercase font-medium">
                {guiCards.claude.status}
              </span>
            </div>

            {/* Model Pill */}
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-[#888888] bg-[#141414] px-2.5 py-1 rounded border border-[#242424]">
              <span>Model:</span>
              <span className="text-[#cccccc] font-medium">{guiCards.claude.model}</span>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#666666] block mb-1">
                Tugas Delegasi:
              </span>
              <div className="p-2.5 rounded-lg bg-[#141414] border border-[#242424] text-xs text-[#cccccc] leading-relaxed min-h-[60px] flex items-center">
                <p>{guiCards.claude.currentTask}</p>
              </div>
            </div>

            {/* Artifact & Telemetry Note */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777777]">
                <span className="flex items-center gap-1.5">
                  <FileCode2 size={11} className="text-[#888888]" />
                  Artifact RFC:
                </span>
                <span className="text-[#cccccc] truncate max-w-[150px]">
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
              onClick={() => handleFocusWindow("claude", "Claude Desktop")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
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
              className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#282828] hover:bg-[#303030] text-white border border-[#3a3a3a] flex items-center justify-center gap-1.5 transition-colors"
            >
              <Send size={12} />
              <span>Send Spec</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 🔵 CARD 2: ANTIGRAVITY (THE CODER & OS)                                   */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between rounded-xl border border-[#282828] hover:border-[#383838] bg-[#181818] p-4 transition-colors">
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

              {/* Status Pill */}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#202020] text-[#a0a0a0] border border-[#2c2c2c] uppercase font-medium">
                {guiCards.antigravity.status}
              </span>
            </div>

            {/* Model Pill */}
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-[#888888] bg-[#141414] px-2.5 py-1 rounded border border-[#242424]">
              <span>Engine:</span>
              <span className="text-[#cccccc] font-medium">{guiCards.antigravity.model}</span>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#666666] block mb-1">
                Tugas Delegasi:
              </span>
              <div className="p-2.5 rounded-lg bg-[#141414] border border-[#242424] text-xs text-[#cccccc] leading-relaxed min-h-[60px] flex items-center">
                <p>{guiCards.antigravity.currentTask}</p>
              </div>
            </div>

            {/* Artifact & Worktree Info */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777777]">
                <span className="flex items-center gap-1.5">
                  <FolderGit2 size={11} className="text-[#888888]" />
                  Git Worktree:
                </span>
                <span className="text-[#cccccc] truncate max-w-[150px]">
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
              onClick={() => handleFocusWindow("antigravity", "Antigravity")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
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
              className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#282828] hover:bg-[#303030] text-white border border-[#3a3a3a] flex items-center justify-center gap-1.5 transition-colors"
            >
              <Play size={12} />
              <span>Run Code</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ⚪ CARD 3: CHATGPT DESKTOP (THE REVIEWER)                                  */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between rounded-xl border border-[#282828] hover:border-[#383838] bg-[#181818] p-4 transition-colors">
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

              {/* Status Pill */}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#202020] text-[#a0a0a0] border border-[#2c2c2c] uppercase font-medium">
                {guiCards.chatgpt.status}
              </span>
            </div>

            {/* Model Pill */}
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-[#888888] bg-[#141414] px-2.5 py-1 rounded border border-[#242424]">
              <span>Model:</span>
              <span className="text-[#cccccc] font-medium">{guiCards.chatgpt.model}</span>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#666666] block mb-1">
                Tugas Delegasi:
              </span>
              <div className="p-2.5 rounded-lg bg-[#141414] border border-[#242424] text-xs text-[#cccccc] leading-relaxed min-h-[60px] flex items-center">
                <p>{guiCards.chatgpt.currentTask}</p>
              </div>
            </div>

            {/* Artifact & Security Score */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777777]">
                <span className="flex items-center gap-1.5">
                  <FileCode2 size={11} className="text-[#888888]" />
                  Target Diff:
                </span>
                <span className="text-[#cccccc] truncate max-w-[150px]">
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
              onClick={() => handleFocusWindow("chatgpt", "ChatGPT Desktop")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
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
              className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#282828] hover:bg-[#303030] text-white border border-[#3a3a3a] flex items-center justify-center gap-1.5 transition-colors"
            >
              <Eye size={12} />
              <span>Audit Diff</span>
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
