# Handoff

State terkini proyek **RigDeck (OpenRig-GUI)**. **Ditimpa per sesi/per checkpoint.**
Dibaca oleh 4 AI: **Master Conductor**, **Claude Desktop**, **Antigravity**, **ChatGPT Desktop**.
Lihat protokol di [[README]], jebakan teknis di [[Jebakan]], dan log harian di `Log/`.

---

## State Saat Ini (2026-10-03)

- **Fokus Utama**: Orkestrasi 3 Desktop AI (Claude, Antigravity, ChatGPT) oleh Master AI Conductor (9Router).
- **Backend**: Rust Tauri v2 (`src-tauri/`):
  - `memory.rs`: Shared Memory Vault reader/writer (`rig-memory/`).
  - `app_bridge.rs`: Linux window activator (`wmctrl -x -a com.anthropic.Claude`, `chatgpt`) & deep-link dispatcher (`xdg-open`).
  - `worktree.rs`: Git Worktree isolation di `.rig/worktrees/*`.
  - `blackboard.rs`: SQLite WAL state manager (`.rig/blackboard.db`).
  - `pty.rs`: Native PTY multiplexer.
- **Frontend**: React + Tailwind + Zustand (`src/`):
  - `MasterConductorChat.tsx`: Chat dengan dropdown model live dari 9Router (`/v1/models`).
  - `GuiControllerDeck.tsx`: 3 Kartu Desktop GUI Controller dengan tombol Focus, Send Spec, Run Code, Audit Diff.
  - `SharedMemoryFeed.tsx`: Live feed journal dari `rig-memory/journal/` atau `Log/`.
- **Status Build**: `cargo test` 5/5 lulus, `bun run build` sukses.

---

## Yang Sedang Dikerjakan

- Sinkronisasi vault Obsidian `rig-memory/` untuk 4 AI.
- Pengujian langsung pergantian model di Conductor Chat dan delegasi tugas.

---

## Langkah Berikutnya

1. Pastikan Obsidian membuka folder `/home/anonimbro/Projects/rigdeck/rig-memory` via **"Open folder as vault"**.
2. Uji kirim prompt dari Master Conductor Chat untuk melihat auto-logging ke `[[Handoff]]` dan `Log/`.
