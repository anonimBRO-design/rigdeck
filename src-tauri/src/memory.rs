//! Shared Memory Vault untuk 4 AI (Master Conductor, Claude Desktop, Antigravity, ChatGPT).
//!
//! Memori disimpan sebagai markdown biasa di `<project>/rig-memory/` supaya:
//! - bisa dibuka langsung sebagai Obsidian vault (wiki-links `[[...]]`),
//! - bisa dibaca/ditulis oleh AI mana pun yang punya akses file (Claude, Antigravity, Codex),
//! - bisa di-commit ke git (riwayat keputusan ikut ter-versioning).

use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

pub const VAULT_DIR: &str = "rig-memory";

/// Catatan inti yang selalu disuntikkan ke konteks Master Conductor.
const CORE_NOTES: &[&str] = &[
    "01-Project-Context.md",
    "02-Decisions.md",
    "03-Agent-Roles.md",
    "04-Conventions.md",
];

#[derive(Debug, Serialize)]
pub struct MemoryNote {
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct MemoryStatus {
    pub vault_path: String,
    pub note_count: usize,
    pub journal_today: String,
}

pub fn vault_root(project_root: &Path) -> PathBuf {
    project_root.join(VAULT_DIR)
}

fn shell_date(fmt: &str) -> String {
    Command::new("date")
        .arg(format!("+{}", fmt))
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn today() -> String {
    shell_date("%Y-%m-%d")
}

fn journal_rel_path(date: &str) -> String {
    format!("journal/{}.md", date)
}

/// Tolak path absolut / `..` supaya AI tidak bisa menulis di luar vault.
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    for comp in rel_path.components() {
        match comp {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(format!("Path tidak diizinkan: {}", rel)),
        }
    }
    Ok(root.join(rel_path))
}

fn write_if_missing(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| format!("Gagal menulis {}: {}", path.display(), e))
}

/// Buat struktur vault bila belum ada. Tidak pernah menimpa catatan yang sudah ada.
pub fn ensure_vault(project_root: &Path) -> Result<PathBuf, String> {
    let root = vault_root(project_root);
    fs::create_dir_all(root.join("journal")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("handoffs")).map_err(|e| e.to_string())?;

    write_if_missing(&root.join("00-INDEX.md"), DEFAULT_INDEX)?;
    write_if_missing(&root.join("01-Project-Context.md"), DEFAULT_CONTEXT)?;
    write_if_missing(&root.join("02-Decisions.md"), DEFAULT_DECISIONS)?;
    write_if_missing(&root.join("03-Agent-Roles.md"), DEFAULT_ROLES)?;
    write_if_missing(&root.join("04-Conventions.md"), DEFAULT_CONVENTIONS)?;
    Ok(root)
}

fn journal_header(date: &str) -> String {
    format!(
        "---\ntype: journal\ndate: {date}\n---\n# Journal {date}\n\nLog bersama 4 AI. Format: `- HH:MM **[agent]** `kind` — isi`. Lihat [[00-INDEX]].\n\n"
    )
}

/// Tambah entri ke journal hari ini. `kind = "decision"` juga dicatat di 02-Decisions.md.
pub fn append_entry(
    project_root: &Path,
    agent: &str,
    kind: &str,
    content: &str,
) -> Result<String, String> {
    let root = ensure_vault(project_root)?;
    let date = today();
    let time = shell_date("%H:%M");
    let rel = journal_rel_path(&date);
    let path = root.join(&rel);

    if !path.exists() {
        fs::write(&path, journal_header(&date)).map_err(|e| e.to_string())?;
    }

    // Satu entri = satu bullet; baris lanjutan di-indent agar markdown tetap rapi.
    let body = content.trim().replace('\n', "\n  ");
    let line = format!("- {time} **[{agent}]** `{kind}` — {body}\n");

    let mut f = OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    f.write_all(line.as_bytes()).map_err(|e| e.to_string())?;

    if kind.eq_ignore_ascii_case("decision") {
        let mut d = OpenOptions::new()
            .append(true)
            .create(true)
            .open(root.join("02-Decisions.md"))
            .map_err(|e| e.to_string())?;
        let entry = format!("\n## {date} {time} — oleh {agent}\n{}\n", content.trim());
        d.write_all(entry.as_bytes()).map_err(|e| e.to_string())?;
    }

    Ok(rel)
}

fn tail_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

fn latest_journal(root: &Path) -> Option<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(root.join("journal"))
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "md").unwrap_or(false))
        .collect();
    files.sort();
    files.pop()
}

/// Ekor journal terbaru (untuk feed di UI).
pub fn journal_tail(project_root: &Path, lines: usize) -> Result<Vec<String>, String> {
    let root = ensure_vault(project_root)?;
    let Some(path) = latest_journal(&root) else {
        return Ok(vec![]);
    };
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let entries: Vec<String> = text
        .lines()
        .filter(|l| l.starts_with("- "))
        .map(|l| l.to_string())
        .collect();
    let start = entries.len().saturating_sub(lines);
    Ok(entries[start..].to_vec())
}

/// Konteks memori yang disuntikkan ke system prompt Master Conductor.
pub fn read_context(project_root: &Path, max_chars: usize) -> Result<String, String> {
    let root = ensure_vault(project_root)?;
    let mut out = String::new();

    for name in CORE_NOTES {
        if let Ok(text) = fs::read_to_string(root.join(name)) {
            out.push_str(&format!("\n===== {VAULT_DIR}/{name} =====\n{}\n", text.trim()));
        }
    }

    if let Some(path) = latest_journal(&root) {
        if let Ok(text) = fs::read_to_string(&path) {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            out.push_str(&format!(
                "\n===== {VAULT_DIR}/journal/{name} (40 baris terakhir) =====\n{}\n",
                tail_lines(&text, 40)
            ));
        }
    }

    // Potong dari depan bila terlalu panjang; journal terbaru (di akhir) lebih penting.
    if out.chars().count() > max_chars {
        let skip = out.chars().count() - max_chars;
        out = format!("…(dipotong)…\n{}", out.chars().skip(skip).collect::<String>());
    }
    Ok(out)
}

pub fn list_notes(project_root: &Path) -> Result<Vec<MemoryNote>, String> {
    let root = ensure_vault(project_root)?;
    let mut notes = Vec::new();
    collect_md(&root, &root, &mut notes);
    notes.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(notes)
}

fn collect_md(root: &Path, dir: &Path, out: &mut Vec<MemoryNote>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue; // lewati .obsidian dll
        }
        if p.is_dir() {
            collect_md(root, &p, out);
        } else if p.extension().map(|x| x == "md").unwrap_or(false) {
            let rel = p.strip_prefix(root).unwrap_or(&p).to_string_lossy().to_string();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(MemoryNote { path: rel, size });
        }
    }
}

pub fn read_note(project_root: &Path, rel: &str) -> Result<String, String> {
    let root = ensure_vault(project_root)?;
    let path = safe_join(&root, rel)?;
    fs::read_to_string(&path).map_err(|e| format!("Gagal membaca {}: {}", rel, e))
}

pub fn status(project_root: &Path) -> Result<MemoryStatus, String> {
    let root = ensure_vault(project_root)?;
    Ok(MemoryStatus {
        vault_path: root.to_string_lossy().to_string(),
        note_count: list_notes(project_root)?.len(),
        journal_today: format!("{VAULT_DIR}/{}", journal_rel_path(&today())),
    })
}

// ---------------------------------------------------------------------------
// Template awal vault
// ---------------------------------------------------------------------------

const DEFAULT_INDEX: &str = r#"---
type: index
---
# 🧠 RigDeck Shared Memory

Memori bersama untuk **4 AI** yang bekerja di proyek ini:

| AI | Peran | Cara akses memori |
|---|---|---|
| 🟣 Master Conductor (9Router) | Orkestrator | Otomatis disuntikkan RigDeck ke system prompt |
| 🟠 Claude Desktop | The Architect | Baca `CLAUDE.md` → vault ini |
| 🔵 Antigravity IDE | The Coder & OS | Baca `AGENTS.md` / `GEMINI.md` → vault ini |
| ⚪ ChatGPT Desktop (Codex) | The Reviewer | Baca `AGENTS.md` → vault ini |

## Catatan inti
- [[01-Project-Context]] — apa yang sedang dibangun
- [[02-Decisions]] — keputusan arsitektur (append-only)
- [[03-Agent-Roles]] — siapa mengerjakan apa
- [[04-Conventions]] — aturan kode & protokol memori

## Folder
- `journal/` — log harian bersama (satu file per hari)
- `handoffs/` — catatan serah-terima tugas antar AI
"#;

const DEFAULT_CONTEXT: &str = r#"---
type: context
---
# Project Context

**RigDeck (OpenRig-GUI)** — Tauri v2 + React desktop app di CachyOS Linux yang menjadi
*Master AI Conductor* (ditenagai 9Router di `http://127.0.0.1:20128/v1`) untuk mengorkestrasi
3 desktop AI: Claude Desktop, Antigravity IDE, dan ChatGPT Desktop.

- Repo: `/home/anonimbro/Projects/rigdeck` (branch `main`)
- Backend: Rust (`src-tauri/src/`): worktree, pty, blackboard (SQLite WAL), app_bridge, memory
- Frontend: React + Tailwind + Zustand (`src/`)
- Tiket aktif untuk Claude: `.rig/context/current_task.json`

Perbarui catatan ini bila scope proyek berubah. Lihat [[00-INDEX]].
"#;

const DEFAULT_DECISIONS: &str = r#"---
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
"#;

const DEFAULT_ROLES: &str = r#"---
type: roles
---
# Agent Roles

- 🟣 **Master Conductor** (9Router, model bisa dipilih di UI) — memecah misi, mendelegasikan, menjaga memori.
- 🟠 **Claude Desktop** — arsitektur, RFC, kontrak API, skema data.
- 🔵 **Antigravity IDE** — implementasi kode, terminal, git worktree, build & test.
- ⚪ **ChatGPT Desktop (Codex)** — review diff, edge case, keamanan.

Lihat [[04-Conventions]] untuk protokol serah-terima.
"#;

const DEFAULT_CONVENTIONS: &str = r#"---
type: conventions
---
# Conventions & Memory Protocol

## Protokol memori (WAJIB untuk semua AI)
1. **Sebelum kerja**: baca [[00-INDEX]], [[01-Project-Context]], [[02-Decisions]], dan journal terbaru di `journal/`.
2. **Sesudah kerja**: tambahkan SATU baris ke `journal/YYYY-MM-DD.md`:
   `- HH:MM **[nama-agent]** `kind` — ringkasan singkat (file yang diubah, hasil, blocker)`
   - `kind`: `mission` · `progress` · `decision` · `handoff` · `review` · `blocker`
3. **Keputusan arsitektur** → juga tambahkan di [[02-Decisions]] (append-only, jangan hapus yang lama).
4. **Serah-terima** ke AI lain → buat file di `handoffs/` dan sebut di journal.
5. Jangan menyimpan secret/API key di vault ini.

## Kode
- Komunikasi dengan user: Bahasa Indonesia santai.
- Rust: `cargo check` & `cargo test` harus lulus. Frontend: `bun run build` harus lulus.
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_project(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rigdeck-mem-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn vault_is_created_and_not_overwritten() {
        let root = temp_project("ensure");
        ensure_vault(&root).unwrap();
        let ctx = root.join(VAULT_DIR).join("01-Project-Context.md");
        fs::write(&ctx, "custom").unwrap();
        ensure_vault(&root).unwrap();
        assert_eq!(fs::read_to_string(&ctx).unwrap(), "custom");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn append_and_tail_and_decision() {
        let root = temp_project("append");
        append_entry(&root, "claude", "progress", "spec selesai").unwrap();
        append_entry(&root, "conductor", "decision", "pakai JWT RS256").unwrap();
        let tail = journal_tail(&root, 10).unwrap();
        assert_eq!(tail.len(), 2);
        assert!(tail[1].contains("[conductor]"));
        let decisions = fs::read_to_string(root.join(VAULT_DIR).join("02-Decisions.md")).unwrap();
        assert!(decisions.contains("pakai JWT RS256"));
        let ctx = read_context(&root, 50_000).unwrap();
        assert!(ctx.contains("spec selesai"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_path_traversal() {
        let root = temp_project("traversal");
        assert!(read_note(&root, "../secret.md").is_err());
        assert!(read_note(&root, "/etc/passwd").is_err());
        let _ = fs::remove_dir_all(&root);
    }
}
