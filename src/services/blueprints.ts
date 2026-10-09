/**
 * Mission Blueprints / Templates for RigDeck
 * 1-Click Sprint Presets for Valence (Master AI Conductor)
 */

export interface MissionBlueprint {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: "feature" | "bugfix" | "security" | "refactor" | "docs";
  prompt: string;
  tags: string[];
}

export const MISSION_BLUEPRINTS: MissionBlueprint[] = [
  {
    id: "fullstack-feature",
    title: "Full-Stack Feature Sprint",
    description: "RFC arsitektur, isolated worktree coding, UI/UX polish & review audit.",
    icon: "🚀",
    category: "feature",
    tags: ["feature", "worktree", "fullstack", "sprint"],
    prompt: `[BLUEPRINT: Full-Stack Feature Sprint]
Mohon pecah misi ini ke 3 Desktop GUI:
1. Mas Claude (Architect): Rancang arsitektur data flow, spec API, dan RFC perubahannya.
2. Mbak Agy (Coder & OS): Buat isolated worktree git baru, implementasikan logic backend & komponen UI, dan jalankan build test.
3. Bg Codex (Reviewer): Lakukan security & code review terhadap diff worktree, verifikasi edge cases sebelum merge.

Tujuan fitur: `,
  },
  {
    id: "bug-hunting",
    title: "Bug Hunting & Repro Fix",
    description: "Analisis log error terminal, repro test, pinpoint root cause & hotfix.",
    icon: "🐛",
    category: "bugfix",
    tags: ["bug", "fix", "terminal", "self-healing", "hotfix"],
    prompt: `[BLUEPRINT: Bug Hunting & Repro Fix]
Terjadi anomali/bug pada sistem. Mohon koordinasikan:
1. Mas Claude (Architect): Analisis root cause dari stack trace dan tentukan invariant yang terlanggar.
2. Mbak Agy (Coder & OS): Tulis test reproduksi yang fail, perbaiki bug di kode sumber, dan pastikan test lulus.
3. Bg Codex (Reviewer): Review diff hotfix untuk mencegah regresi atau efek samping tak terduga.

Detail issue / error log: `,
  },
  {
    id: "security-audit",
    title: "Security & Token Leak Audit",
    description: "Inspeksi credential leak, sanitasi input, OWASP, dan update Jebakan.md.",
    icon: "🛡️",
    category: "security",
    tags: ["security", "audit", "secrets", "jebakan", "owasp"],
    prompt: `[BLUEPRINT: Security & Token Leak Audit]
Lakukan audit keamanan menyeluruh terhadap codebase:
1. Mas Claude (Architect): Audit perizinan file, token leak, env handling, dan model trust boundary.
2. Mbak Agy (Coder & OS): Scan codebase untuk vulnerable dependencies, sanitasi input query, dan perbarui file rig-memory/Jebakan.md.
3. Bg Codex (Reviewer): Lakukan adversarial review dan rekomendasikan hardening security checks.

Fokus area: `,
  },
  {
    id: "obsidian-sync",
    title: "Obsidian Vault & ADR Sync",
    description: "Sinkronisasi keputusan teknis ke 01-Project-Context, 02-Decisions, & journal.",
    icon: "📚",
    category: "docs",
    tags: ["obsidian", "docs", "adr", "memory", "vault"],
    prompt: `[BLUEPRINT: Obsidian Vault & ADR Sync]
Rangkum progres dan sinkronisasikan memory proyek ke vault Obsidian:
1. Mas Claude (Architect): Dokumentasikan Architectural Decision Records (ADR) baru ke rig-memory/02-Decisions.md.
2. Mbak Agy (Coder & OS): Update status implementasi komponen dan file penting di rig-memory/01-Project-Context.md.
3. Bg Codex (Reviewer): Verifikasi konsistensi antara kode aktual dan catatan di Obsidian.

Perubahan terkini: `,
  },
  {
    id: "perf-optimization",
    title: "Performance & Concurrency Tune",
    description: "Optimasi latensi SQLite WAL, PTY streaming, dan memory footprint.",
    icon: "⚡",
    category: "refactor",
    tags: ["performance", "speed", "concurrency", "optimize"],
    prompt: `[BLUEPRINT: Performance & Concurrency Tune]
Optimasi efisiensi dan performa aplikasi:
1. Mas Claude (Architect): Analisis bottleneck I/O, concurrency lock, dan payload serialization.
2. Mbak Agy (Coder & OS): Terapkan lazy loading, caching query rusqlite, dan optimalkan rendering reaktif.
3. Bg Codex (Reviewer): Profiling benchmark komparatif sebelum vs sesudah optimasi.

Target optimasi: `,
  },
];

export function searchBlueprints(query: string): MissionBlueprint[] {
  const q = query.trim().toLowerCase();
  if (!q) return MISSION_BLUEPRINTS;
  return MISSION_BLUEPRINTS.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q) ||
      b.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function getBlueprintById(id: string): MissionBlueprint | undefined {
  return MISSION_BLUEPRINTS.find((b) => b.id === id);
}
