/**
 * Self-Healing Watcher Service untuk RigDeck Terminal Stream.
 * Mendeteksi runtime & compiler error di terminal, lalu memicu prompt perbaikan otomatis.
 */

import { soundFx } from "./soundFx";
import { recordAuditEvent } from "./history";

export interface SelfHealingAlert {
  id: string;
  agentId: string;
  errorType: "typescript" | "rust" | "test_failure" | "runtime";
  title: string;
  snippet: string;
  timestamp: string;
}

type AlertListener = (alert: SelfHealingAlert | null) => void;

class SelfHealingWatcher {
  private enabled: boolean = true;
  private currentAlert: SelfHealingAlert | null = null;
  private listeners: AlertListener[] = [];
  private lastAlertTime: number = 0;

  constructor() {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rigdeck.selfHealing");
      if (saved !== null) {
        this.enabled = saved === "true";
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    localStorage.setItem("rigdeck.selfHealing", String(val));
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public subscribe(fn: AlertListener): () => void {
    this.listeners.push(fn);
    fn(this.currentAlert);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  public clearAlert() {
    this.currentAlert = null;
    this.notify();
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.currentAlert));
  }

  /**
   * Pindai chunk teks dari terminal PTY stream untuk mendeteksi error pattern.
   */
  public inspectTerminalStream(agentId: string, chunk: string) {
    if (!this.enabled) return;

    // Throttle to avoid repeated alerts within 4 seconds
    const now = Date.now();
    if (now - this.lastAlertTime < 4000) return;

    // 1. TypeScript Error pattern: error TS2322: ...
    const tsMatch = chunk.match(/error TS\d+:\s*(.*)/);
    if (tsMatch) {
      this.triggerAlert({
        id: `heal-${now}`,
        agentId,
        errorType: "typescript",
        title: "TypeScript Compiler Error",
        snippet: tsMatch[0].slice(0, 180),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      return;
    }

    // 2. Rust / Cargo Error: error[E0308]: ... atau panicked at ...
    const rustMatch = chunk.match(/(error\[E\d+\]:.*|panicked at\s*'.*')/);
    if (rustMatch) {
      this.triggerAlert({
        id: `heal-${now}`,
        agentId,
        errorType: "rust",
        title: "Cargo / Rust Compiler Panic",
        snippet: rustMatch[0].slice(0, 180),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      return;
    }

    // 3. Test Runner Failure: FAIL / failed X of Y tests
    const testMatch = chunk.match(/(FAIL\s+.*|test result: FAILED\..*|failed \d+ of \d+ tests)/);
    if (testMatch) {
      this.triggerAlert({
        id: `heal-${now}`,
        agentId,
        errorType: "test_failure",
        title: "QA Test Suite Regression / Failure",
        snippet: testMatch[0].slice(0, 180),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      return;
    }
  }

  private triggerAlert(alert: SelfHealingAlert) {
    this.lastAlertTime = Date.now();
    this.currentAlert = alert;
    soundFx.playSecurityAlert();
    this.notify();

    recordAuditEvent(
      alert.agentId,
      "self_healing_detected",
      `Self-Healing mendeteksi ${alert.title}: ${alert.snippet}`
    ).catch(() => {});
  }
}

export const selfHealingWatcher = new SelfHealingWatcher();
