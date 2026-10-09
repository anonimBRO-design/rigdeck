/**
 * Token & Quota Radar Service.
 * Melacak konsumsi token, burn-rate per menit, serta manajemen Eco Mode.
 */

const ECO_KEY = "rigdeck.ecoMode";
const TOKENS_KEY = "rigdeck.sessionTokens";

interface TokenEvent {
  timestamp: number;
  tokens: number;
}

class QuotaRadar {
  private sessionTokens: number = 0;
  private recentEvents: TokenEvent[] = [];
  private ecoMode: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.ecoMode = localStorage.getItem(ECO_KEY) === "true";
      const savedTokens = sessionStorage.getItem(TOKENS_KEY);
      if (savedTokens) {
        this.sessionTokens = parseInt(savedTokens, 10) || 0;
      }
    }
  }

  public isEcoMode(): boolean {
    return this.ecoMode;
  }

  public setEcoMode(enabled: boolean) {
    this.ecoMode = enabled;
    localStorage.setItem(ECO_KEY, String(enabled));
  }

  public toggleEcoMode(): boolean {
    this.setEcoMode(!this.ecoMode);
    return this.ecoMode;
  }

  public trackTokens(count: number) {
    if (count <= 0) return;
    this.sessionTokens += count;
    this.recentEvents.push({ timestamp: Date.now(), tokens: count });
    if (typeof window !== "undefined") {
      sessionStorage.setItem(TOKENS_KEY, String(this.sessionTokens));
    }
    // Keep events from last 15 minutes
    const cutoff = Date.now() - 15 * 60 * 1000;
    this.recentEvents = this.recentEvents.filter((e) => e.timestamp >= cutoff);
  }

  public getSessionTokens(): number {
    return this.sessionTokens;
  }

  /**
   * Menghitung burn rate (tokens / menit) dalam 10 menit terakhir.
   */
  public getBurnRate(): number {
    const cutoff = Date.now() - 10 * 60 * 1000;
    const windowEvents = this.recentEvents.filter((e) => e.timestamp >= cutoff);
    if (windowEvents.length === 0) return 0;

    const totalWindowTokens = windowEvents.reduce((acc, e) => acc + e.tokens, 0);
    const spanMinutes = Math.max(1, (Date.now() - windowEvents[0].timestamp) / 60000);
    return Math.round(totalWindowTokens / spanMinutes);
  }

  /**
   * Jika Eco Mode aktif dan model yang dipilih tergolong boros (Opus / GPT-5 / High-Reasoning),
   * cari model hemat (Flash / Haiku / Mini) dari daftar model 9Router.
   */
  public resolveEcoModel(selectedModel: string, availableModels: string[]): string {
    if (!this.ecoMode) return selectedModel;

    const isHeavyweight =
      selectedModel.toLowerCase().includes("opus") ||
      selectedModel.toLowerCase().includes("gpt-5") ||
      selectedModel.toLowerCase().includes("reasoning");

    if (!isHeavyweight) return selectedModel;

    // Prioritaskan model flash/haiku/mini yang ada di 9Router
    const ecoCandidates = [
      "gemini-2.5-flash",
      "claude-3-5-haiku",
      "gpt-4o-mini",
      "gemini-3.5-flash",
      "gemini-2.0-flash",
    ];

    for (const cand of ecoCandidates) {
      if (availableModels.includes(cand)) {
        return cand;
      }
    }

    return selectedModel;
  }
}

export const quotaRadar = new QuotaRadar();
