---
type: context
---
# Project Context

**RigDeck (OpenRig-GUI)** — Tauri v2 + React desktop app di CachyOS Linux yang menjadi
*Master AI Conductor* (ditenagai 9Router di `http://127.0.0.1:20128/v1`) untuk mengorkestrasi
3 desktop AI: Claude Desktop, Antigravity IDE, dan ChatGPT Desktop.

- Repo: `/home/anonimbro/Projects/rigdeck` (branch `main`)
- Backend: Rust (`src-tauri/src/`): worktree, pty, blackboard (SQLite WAL), app_bridge, memory, project
- Frontend: React + Tailwind + Zustand (`src/`)
- Tiket aktif untuk Claude: `.rig/context/current_task.json`

## Fitur inti (v1.2)
- **Projects** — multi-workspace switcher; registry di `~/.config/rigdeck/projects.json`, tiap project punya `.rig/blackboard.db` + `rig-memory/` sendiri.
- **Conversation (Valence)** — multi-session chat Master Conductor (tabel `conversations` & `conversation_messages`), sidebar thread collapsible, auto-title, rename/delete, live token streaming.
- **History & Audit Trail** — audit trail permanen (tabel `agent_events`), pencarian full-text lintas thread (FTS5), export handoff markdown ke Obsidian.
- **1-Click Safe Merge & Worktree Cleaner** — backend safe merge git (`git checkout <base>`, `git merge --no-ff`, worktree cleanup) dengan visual 3-way diff inspector.
- **Self-Healing Watcher** — deteksi regex realtime pada terminal PTY stream (TypeScript, Rust panic, test runner fail) dengan 1-click auto-fix prompt generation.
- **Global Command Palette (`Ctrl + K`)** — omni-search instant untuk navigasi view, switch project, ganti thread, fokus terminal agen (Mas Claude, Mbak Agy, Bg Codex), dan toggle settings.
- **Mission Blueprints** — template sprint 1-klik untuk Valence chat (Full-Stack Feature, Bug Hunting, Security Audit, Obsidian Vault Sync, Perf Tune).
- **Context Dropzone** — drag-and-drop file multi-format langsung ke composer Valence, preview chips, auto-injection ke context prompt markdown.

Perbarui catatan ini bila scope proyek berubah. Lihat [[00-INDEX]].
