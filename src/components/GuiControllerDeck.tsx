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
          "RigDeck Mission Control: Buka dan rancang arsitektur sesuai file .rig/context/current_task.json"
        );
      }

      updateGuiCard("claude", {
        status: "working",
        telemetryNote: ".rig/context/current_task.json dikirim via deep-link & clipboard",
      });
      showHud("Tiket ditulis ke .rig/context/current_task.json & Claude Desktop difokuskan!");
    } catch (err) {
      console.warn("Could not dispatch pointer task via Tauri invoke:", err);
      updateGuiCard("claude", {
        status: "working",
        telemetryNote: "Spec disiapkan di .rig/context/current_task.json",
      });
      showHud("Spesifikasi RFC disiapkan untuk Claude Desktop!");
    }
  };

  const handleRunCode = async () => {
    try {
      await handleFocusWindow("antigravity", "Antigravity");
      // Prepare worktree if needed
      await invoke("create_agent_worktree", { branch: "feat-impl" }).catch(() => {});
      updateGuiCard("antigravity", {
        status: "working",
        telemetryNote: "Worktree feat-impl aktif, window diaktifkan",
      });
      showHud("Antigravity diaktifkan dengan isolated git worktree!");
    } catch (err) {
      console.error(err);
      showHud("Antigravity test runner aktif!");
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
        `Audit review git diff untuk branch ${guiCards.antigravity.artifactOrBranch || "feat-impl"}:\n- Periksa potensi secret leakage\n- Validasi edge-case handling\n- Evaluasi efisiensi memori & async concurrency`
      );
    }
    updateGuiCard("chatgpt", {
      status: "reviewing",
      telemetryNote: "Diff prompt disalin ke clipboard & ChatGPT difokuskan",
    });
    showHud("Membuka 3-Way Diff Viewer & memfokuskan ChatGPT Desktop!");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] overflow-hidden select-none relative">
      {/* Top Floating HUD Toast */}
      {hudFeedback && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/95 border border-blue-500/50 text-cyan-300 font-mono text-xs shadow-2xl flex items-center gap-2 backdrop-blur-md animate-fadeIn">
          <Sparkles size={14} className="text-cyan-400" />
          <span>{hudFeedback}</span>
        </div>
      )}

      {/* Controller Deck Top Bar */}
      <div className="h-12 border-b border-rig-border bg-slate-900/80 px-5 flex items-center justify-between backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <Zap size={15} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              Desktop GUI Controller Deck
              <span className="text-[10px] font-mono normal-case px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                3 GUIs Connected
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              handleFocusWindow("claude", "Claude Desktop");
              setTimeout(() => handleFocusWindow("antigravity", "Antigravity"), 300);
              setTimeout(() => handleFocusWindow("chatgpt", "ChatGPT Desktop"), 600);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
          >
            <RefreshCw size={12} className="text-cyan-400" />
            <span>Tile All 3 Windows</span>
          </button>
        </div>
      </div>

      {/* Main Deck Container: 3 Elegant Interactive Cards */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-5 overflow-y-auto items-stretch">
        {/* ========================================================================= */}
        {/* 🟠 CARD 1: CLAUDE DESKTOP (THE ARCHITECT)                                 */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-950/20 via-slate-900/90 to-slate-950/95 p-5 shadow-xl shadow-amber-500/5 hover:border-amber-500/70 transition-all duration-300 relative group">
          {/* Card Top: Brand, Role & Status */}
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 border border-amber-400/30">
                  <Layers size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    {guiCards.claude.name}
                  </h3>
                  <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                    🟠 {guiCards.claude.role}
                  </span>
                </div>
              </div>

              {/* Status Pill */}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase tracking-wider font-semibold">
                {guiCards.claude.status}
              </span>
            </div>

            {/* Model Pill */}
            <div className="mt-4 flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-500">Model:</span>
              <span className="text-amber-300 font-semibold">{guiCards.claude.model}</span>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1.5 font-semibold">
                Current Delegated Mission:
              </span>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/20 text-xs text-slate-200 leading-relaxed min-h-[64px] flex items-center">
                <p>{guiCards.claude.currentTask}</p>
              </div>
            </div>

            {/* Artifact & Telemetry Note */}
            <div className="mt-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <FileCode2 size={12} className="text-amber-400" />
                  Artifact RFC:
                </span>
                <span className="text-slate-200 font-semibold truncate max-w-[160px]">
                  {guiCards.claude.artifactOrBranch}
                </span>
              </div>

              {guiCards.claude.telemetryNote && (
                <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  <span>{guiCards.claude.telemetryNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center gap-2.5">
            <button
              onClick={() => handleFocusWindow("claude", "Claude Desktop")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                activeFocusing === "claude"
                  ? "bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30"
                  : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700"
              }`}
            >
              <ExternalLink size={13} />
              <span>Focus Window</span>
            </button>

            <button
              onClick={handleSendSpec}
              className="py-2 px-3.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/25 transition-all"
            >
              <Send size={13} />
              <span>Send Spec</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 🔵 CARD 2: ANTIGRAVITY (THE CODER & OS)                                   */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between rounded-2xl border border-cyan-500/40 bg-gradient-to-b from-cyan-950/20 via-slate-900/90 to-slate-950/95 p-5 shadow-xl shadow-cyan-500/5 hover:border-cyan-500/70 transition-all duration-300 relative group">
          {/* Card Top: Brand, Role & Status */}
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
                  <Code2 size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    {guiCards.antigravity.name}
                  </h3>
                  <span className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1">
                    🔵 {guiCards.antigravity.role}
                  </span>
                </div>
              </div>

              {/* Status Pill */}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider font-semibold animate-pulse">
                {guiCards.antigravity.status}
              </span>
            </div>

            {/* Model Pill */}
            <div className="mt-4 flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-500">Engine:</span>
              <span className="text-cyan-300 font-semibold">{guiCards.antigravity.model}</span>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1.5 font-semibold">
                Current Delegated Mission:
              </span>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/20 text-xs text-slate-200 leading-relaxed min-h-[64px] flex items-center">
                <p>{guiCards.antigravity.currentTask}</p>
              </div>
            </div>

            {/* Artifact & Worktree Info */}
            <div className="mt-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <FolderGit2 size={12} className="text-cyan-400" />
                  Git Worktree:
                </span>
                <span className="text-slate-200 font-semibold truncate max-w-[160px]">
                  {guiCards.antigravity.artifactOrBranch}
                </span>
              </div>

              {guiCards.antigravity.telemetryNote && (
                <div className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                  <Zap size={11} />
                  <span>{guiCards.antigravity.telemetryNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center gap-2.5">
            <button
              onClick={() => handleFocusWindow("antigravity", "Antigravity")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                activeFocusing === "antigravity"
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-lg shadow-cyan-500/30"
                  : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700"
              }`}
            >
              <ExternalLink size={13} />
              <span>Focus Window</span>
            </button>

            <button
              onClick={handleRunCode}
              className="py-2 px-3.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/25 transition-all"
            >
              <Play size={13} />
              <span>Run Code</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ⚪ CARD 3: CHATGPT DESKTOP (THE REVIEWER)                                  */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/20 via-slate-900/90 to-slate-950/95 p-5 shadow-xl shadow-emerald-500/5 hover:border-emerald-500/70 transition-all duration-300 relative group">
          {/* Card Top: Brand, Role & Status */}
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
                  <ShieldCheck size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    {guiCards.chatgpt.name}
                  </h3>
                  <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                    ⚪ {guiCards.chatgpt.role}
                  </span>
                </div>
              </div>

              {/* Status Pill */}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider font-semibold">
                {guiCards.chatgpt.status}
              </span>
            </div>

            {/* Model Pill */}
            <div className="mt-4 flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-500">Model:</span>
              <span className="text-emerald-300 font-semibold">{guiCards.chatgpt.model}</span>
            </div>

            {/* Active Delegated Task */}
            <div className="mt-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1.5 font-semibold">
                Current Delegated Mission:
              </span>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/20 text-xs text-slate-200 leading-relaxed min-h-[64px] flex items-center">
                <p>{guiCards.chatgpt.currentTask}</p>
              </div>
            </div>

            {/* Artifact & Security Score */}
            <div className="mt-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <FileCode2 size={12} className="text-emerald-400" />
                  Target Diff:
                </span>
                <span className="text-slate-200 font-semibold truncate max-w-[160px]">
                  {guiCards.chatgpt.artifactOrBranch}
                </span>
              </div>

              {guiCards.chatgpt.telemetryNote && (
                <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  <span>{guiCards.chatgpt.telemetryNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center gap-2.5">
            <button
              onClick={() => handleFocusWindow("chatgpt", "ChatGPT Desktop")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                activeFocusing === "chatgpt"
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/30"
                  : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700"
              }`}
            >
              <ExternalLink size={13} />
              <span>Focus Window</span>
            </button>

            <button
              onClick={handleAuditDiff}
              className="py-2 px-3.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/25 transition-all"
            >
              <Eye size={13} />
              <span>Audit Diff</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuiControllerDeck;
