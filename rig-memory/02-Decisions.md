---
type: decisions
---
# Architecture Decisions (append-only)

Jangan menghapus entri lama. Keputusan baru ditambahkan di bawah. Lihat [[00-INDEX]].

## ADR-001 — Hub-and-Spoke Blackboard
Koordinasi antar-agen lewat SQLite WAL (`.rig/blackboard.db`), bukan peer-to-peer.

## ADR-002 — Git Worktree Isolation
Setiap agen pengubah kode bekerja di `.rig/worktrees/<branch>`.

## ADR-003 — Pointer Context File untuk Claude
Payload panjang ditulis ke `.rig/context/current_task.json`; deep-link `claude://` hanya berisi pointer
(batas URL ~2048 karakter di Linux).

## ADR-004 — Shared Memory Vault
Memori bersama 4 AI berupa markdown di `rig-memory/` (kompatibel Obsidian), di-commit ke git.

## ADR-005 — Registry Project Global + Blackboard per-Project
Daftar project disimpan di `~/.config/rigdeck/projects.json` (bukan di dalam repo), sedangkan
`.rig/blackboard.db` tetap per-project. Saat `switch_project`, backend membuka ulang koneksi SQLite
ke db project tujuan (`BlackboardState::switch_database`) dan menyiapkan `rig-memory/` di root baru,
sehingga isolasi data antar-project terjaga tanpa restart aplikasi.
`RIGDECK_CONFIG_DIR` disediakan sebagai override untuk pengujian/portable mode.

## ADR-006 — Conversation Persist di Blackboard, Judul Otomatis
Sesi chat Master Conductor disimpan di tabel `conversations` + `conversation_messages` pada blackboard
project (bukan localStorage/JSON terpisah), dengan `ON DELETE CASCADE`. Setiap `save_message` yang
membawa `delegations_json` juga menulis event `MISSION_DELEGATED` ke `agent_events`, sehingga audit
trail delegasi terbentuk otomatis tanpa jalur tulis kedua. Judul thread di-generate dari prompt
pertama selama masih berjudul default (`New Mission`).

## 2026-10-06 17:30 — oleh conductor
### 🎯 Milestone: Trio Collaboration Sprint (05:30 PM)
- **Status:** ✅ COMPLETED & APPROVED
- **Orchestrator:** Valence • 9Router
- **Delegasi Trio:**
  - 🟠 **Mas Claude:** Design System Architecture & Task Decomposition for RigDeck v1.1
  - 🔵 **Mbak Agy:** Implement JWT session validation & scaffold isolated git worktrees
  - ⚪ **Bg Codex:** Auditing git diff for secret leakage, token expiration & edge cases
- **Artifact / Branch:** `rig/feat-auth (.rig/worktrees/feat-auth)`
- **Ringkasan:** Sprint kolaborasi selesai. Mas Claude merancang arsitektur, Mbak Agy mengimplementasikan kode di branch rig/feat-auth (.rig/worktrees/feat-auth), dan Bg Codex telah mengaudit diff.
- **Wiki Links:** [[01-Project-Context]], [[02-Decisions]]
- **Tags:** #rigdeck #milestone #done

## ADR-007 — Next-Gen Suite: Safe Merge, Self-Healing, Command Palette, Blueprints, & Dropzone
1. **1-Click Safe Merge**: Operasi merge dieksekusi di backend Rust (`safe_merge_worktree`) dengan `git merge --no-ff`, menghapus direktori worktree `.rig/worktrees/<branch>` secara aman, dan mengembalikan commit hash.
2. **Self-Healing Watcher**: Output stream terminal PTY dipindai non-blocking dengan throttle 4 detik untuk pola kegagalan kritis (`error TS`, `error[E]`, `panicked at`, `FAIL`). Banner alert menyajikan 1-click prompt generator untuk perbaikan otomatis oleh agen.
3. **Global Command Palette (`Ctrl + K`)**: Modal omni-search berbasis keyboard listener global untuk navigasi instan antar views, project switcher, thread switcher, kontrol agen (Mas Claude, Mbak Agy, Bg Codex), dan sistem settings.
4. **Mission Blueprints**: Presets sprint terstruktur (Full-Stack Feature, Bug Hunting, Security Audit, Obsidian Sync, Perf Optimization) untuk mempercepat orkestrasi Valence.
5. **Context Dropzone**: File drag-and-drop didukung langsung pada composer chat Valence, dengan auto-formatting fenced code blocks di prompt injection context.


## ADR-007 — Penutup Loop Delegasi via task_result.json
Agen menulis hasil ke `.rig/context/task_result.json` (sesuai `return_instructions.on_complete`
di Conductor Task Schema). RigDeck mem-poll file ini tiap 15 detik, lalu dalam satu transaksi:
update status DAG, catat event `MISSION_RESULT_RECEIVED` ke `agent_events`, dan sinkron ke journal.
Idempotensi dijamin tabel `app_state` dengan fingerprint `task_id|status|completed_at`, sehingga
polling berulang tidak menduplikasi audit trail.

## ADR-008 — FTS5 untuk Pencarian Lintas Thread
Pencarian memakai virtual table `conversation_messages_fts` (FTS5) dengan trigger sinkronisasi
insert/delete + backfill idempotent untuk pesan lama. Input user disanitasi `build_fts_query()`
(operator FTS dibuang, term terakhir prefix-match) agar pencarian tidak pernah memicu syntax error.
Snippet memakai penanda `<< >>` dan dirender sebagai elemen React, bukan HTML mentah.

## ADR-009 — Handoff Export ke Obsidian Vault
Percakapan dapat diekspor menjadi `rig-memory/handoffs/<slug>.md` dengan frontmatter Obsidian,
wiki-links ke catatan inti, transkrip lengkap, dan instruksi untuk agen penerima. `slugify()`
menjamin nama file aman dari path traversal; file lama tidak pernah ditimpa (suffix `-2`, `-3`).

## ADR-010 — 4 AI Agent System, On/Off Toggles, dan Hermes Adaptive Role
1. **Agent Toggle Independen**: Setiap agen desktop (Claude, Antigravity, ChatGPT, Hermes) memiliki saklar power toggle mandiri. Agen yang dinonaktifkan (OFF) tidak akan dieksekusi secara manual maupun otomatis, dan statusnya divisualisasikan dengan jelas di UI.
2. **Hermes Adaptive Engine**: Agen ke-4 (Hermes) bekerja secara adaptif. Jika ada agen yang dinonaktifkan, Hermes otomatis menggantikan peran tersebut (Claude OFF -> Architect; Agy OFF -> Coder; Codex OFF -> Reviewer). Jika ketiga agen aktif, Hermes bertindak sebagai Co-Pilot Serbaguna (All-Rounder). Tersedia juga manual role override selector langsung di kartu Hermes.
3. **Win32 Native App Activator**: Pemanggilan jendela desktop Windows beralih dari PowerShell WScript.Shell ke Win32 API native (`EnumWindows`, `SetForegroundWindow`, `ShowWindow`) untuk latensi instan (<1ms) dan keandalan tinggi tanpa subprocess overhead.
4. **9Router Health Resilience**: Timeout cURL health check diperpanjang ke 8s untuk mengakomodasi pool 560 model tanpa false-negative offline status.
5. **Pre-Merge Gatekeeper**: Diff review modal memvalidasi potensi kebocoran credential/secret sebelum merge diizinkan, memadukan checklist pengujian otomatis dan topologi isolated worktree.
