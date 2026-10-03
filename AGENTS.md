# AGENTS.md — RigDeck

Dibaca otomatis oleh **ChatGPT Desktop (Codex)** dan **Antigravity IDE**.
Claude membaca file ini lewat `CLAUDE.md`.

## 🧠 Shared Memory (WAJIB)

Proyek ini memakai memori bersama untuk 4 AI (Master Conductor, Claude, Antigravity, ChatGPT)
di folder **`rig-memory/`** (markdown, bisa dibuka sebagai Obsidian vault).

**Sebelum mulai kerja**, baca:
1. `rig-memory/00-INDEX.md`
2. `rig-memory/01-Project-Context.md`
3. `rig-memory/02-Decisions.md`
4. File terbaru di `rig-memory/journal/`

**Sesudah selesai kerja**, tambahkan SATU baris ke `rig-memory/journal/YYYY-MM-DD.md` (buat bila belum ada):

```
- HH:MM **[nama-agent]** `kind` — ringkasan (file yang diubah, hasil, blocker)
```

- `nama-agent`: `claude` · `antigravity` · `chatgpt` · `conductor`
- `kind`: `mission` · `progress` · `decision` · `handoff` · `review` · `blocker`
- Keputusan arsitektur → tambahkan juga ke `rig-memory/02-Decisions.md` (append-only).
- Serah-terima ke AI lain → tulis di `rig-memory/handoffs/`.
- Jangan simpan secret / API key di `rig-memory/`.

## Tiket aktif
Tugas dari Master Conductor ada di `.rig/context/current_task.json`.

## Peran
- 🟠 Claude Desktop — arsitektur & spesifikasi
- 🔵 Antigravity IDE — implementasi kode, terminal, git worktree
- ⚪ ChatGPT Desktop — review diff, edge case, keamanan

## Verifikasi
- Rust: `cargo check` & `cargo test` di `src-tauri/`
- Frontend: `bun run build`
