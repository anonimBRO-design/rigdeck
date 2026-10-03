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
