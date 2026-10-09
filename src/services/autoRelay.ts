/**
 * Auto-Relay Pipeline Engine: Mengorkestrasi handover otomatis antara
 * 🟠 Mas Claude -> 🔵 Mbak Agy -> ⚪ Bg Codex.
 */

import { AutoRelayStage } from "../types";
import { soundFx } from "./soundFx";
import { syncObsidianDailyRecap } from "./sharedMemory";
import { recordAuditEvent } from "./history";

export interface RelayContext {
  missionTitle: string;
  claudeTask?: string;
  antigravityTask?: string;
  chatgptTask?: string;
  worktreeBranch?: string;
}

export class AutoRelayEngine {
  private enabled: boolean = false;
  private stage: AutoRelayStage = "idle";
  private context: RelayContext | null = null;
  private listeners: ((stage: AutoRelayStage, enabled: boolean) => void)[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.enabled = localStorage.getItem("rigdeck.autoRelay") === "true";
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getStage(): AutoRelayStage {
    return this.stage;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    localStorage.setItem("rigdeck.autoRelay", String(val));
    this.notify();
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public subscribe(fn: (stage: AutoRelayStage, enabled: boolean) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.stage, this.enabled));
  }

  public setStage(stage: AutoRelayStage) {
    this.stage = stage;
    this.notify();
  }

  /**
   * Mulai pipeline otomatis dari misi yang baru saja didelegasikan Valence.
   */
  public async startPipeline(ctx: RelayContext): Promise<void> {
    if (!this.enabled) return;

    this.context = ctx;
    this.setStage("claude_spec");
    soundFx.playMissionDispatched();

    await recordAuditEvent(
      "conductor",
      "relay_started",
      `Auto-Relay dimulai untuk misi: "${ctx.missionTitle}"`
    );

    // Langkah 1: Mas Claude (Spec Phase)
    if (ctx.claudeTask) {
      soundFx.playRelayStep();
    }

    // Jika ada tugas coding untuk Mbak Agy, siapkan transisi bertahap
    // (Bisa dilanjutkan otomatis atau step-by-step)
  }

  /**
   * Transisi step ke Mbak Agy (Coding Phase)
   */
  public async advanceToCoding(worktreePath: string): Promise<void> {
    this.setStage("agy_coding");
    soundFx.playRelayStep();
    await recordAuditEvent(
      "antigravity",
      "relay_stage_coding",
      `Auto-Relay beralih ke Mbak Agy di worktree: ${worktreePath}`
    );
  }

  /**
   * Transisi step ke Bg Codex (Review Phase)
   */
  public async advanceToReview(): Promise<void> {
    this.setStage("codex_review");
    soundFx.playBuildSuccess();
    await recordAuditEvent(
      "chatgpt",
      "relay_stage_review",
      `Mbak Agy selesai. Auto-Relay mengalihkan audit ke Bg Codex.`
    );
  }

  /**
   * Finalisasi: Seluruh pipeline selesai & siap di-merge!
   */
  public async completePipeline(summaryText?: string): Promise<void> {
    this.setStage("ready_merge");
    soundFx.playMissionComplete();

    if (this.context) {
      await syncObsidianDailyRecap({
        missionTitle: this.context.missionTitle,
        summary: summaryText || "Pipeline otomatis selesai dengan approval penuh.",
        claudeTask: this.context.claudeTask,
        antigravityTask: this.context.antigravityTask,
        chatgptTask: this.context.chatgptTask,
        branch: this.context.worktreeBranch || "rig/feat-impl",
      });
    }

    await recordAuditEvent(
      "conductor",
      "relay_completed",
      `Auto-Relay SELESAI. Siap di-merge & tersinkronisasi ke Obsidian!`
    );
  }

  public reset() {
    this.stage = "idle";
    this.context = null;
    this.notify();
  }
}

export const autoRelayEngine = new AutoRelayEngine();
