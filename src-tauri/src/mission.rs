//! Penutup loop delegasi (mission result watcher).
//!
//! RigDeck mengirim tugas ke 3 GUI desktop, tapi hasilnya tidak pernah kembali otomatis.
//! Modul ini membaca `.rig/context/task_result.json` (yang ditulis agen setelah selesai,
//! sesuai `return_instructions.on_complete` di Conductor Task Schema), lalu:
//!
//! 1. memperbarui status task terkait di DAG (`task_dag`),
//! 2. mencatat event audit (`MISSION_RESULT_RECEIVED`) ke `agent_events`,
//! 3. menyuntikkan ringkasan hasil ke shared memory (`rig-memory/journal/`).
//!
//! Hasil yang sudah diproses ditandai di tabel `app_state` memakai
//! `(task_id, status, completed_at)` sebagai fingerprint, sehingga polling berulang
//! tidak menghasilkan duplikasi.

use crate::blackboard::BlackboardState;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Isi `.rig/context/task_result.json` — kontrak balik dari agen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    #[serde(default, alias = "taskId")]
    pub task_id: String,
    /// `COMPLETED` | `FAILED` | `BLOCKED` | `IN_PROGRESS`
    #[serde(default)]
    pub status: String,
    #[serde(default, alias = "agentId")]
    pub agent_id: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub artifacts: Vec<String>,
    #[serde(default, alias = "completedAt")]
    pub completed_at: String,
}

/// Ringkasan hasil polling untuk UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissionPollOutcome {
    /// True bila ada hasil baru yang benar-benar diproses (bukan duplikat).
    pub processed: bool,
    pub task_result: Option<TaskResult>,
    /// Status task di DAG setelah pembaruan (bila task-nya ketemu).
    pub dag_status: Option<String>,
    pub message: String,
}

/// Path file hasil misi untuk sebuah project root.
pub fn task_result_path(project_root: &Path) -> std::path::PathBuf {
    project_root
        .join(".rig")
        .join("context")
        .join("task_result.json")
}

fn fingerprint(result: &TaskResult) -> String {
    format!(
        "{}|{}|{}",
        result.task_id,
        result.status.to_uppercase(),
        result.completed_at
    )
}

fn state_key(project_id: &str) -> String {
    format!("mission_result_seen::{}", project_id)
}

/// Petakan status hasil agen ke status DAG RigDeck.
fn map_status(result_status: &str) -> &'static str {
    match result_status.trim().to_uppercase().as_str() {
        "COMPLETED" | "DONE" | "SUCCESS" => "COMPLETED",
        "FAILED" | "ERROR" => "FAILED",
        "BLOCKED" => "BLOCKED",
        "IN_PROGRESS" | "RUNNING" => "IN_PROGRESS",
        _ => "IN_REVIEW",
    }
}

/// Baca `.rig/context/task_result.json` tanpa memprosesnya.
pub fn read_task_result(project_root: &Path) -> Result<Option<TaskResult>, String> {
    let path = task_result_path(project_root);
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Gagal membaca {}: {}", path.display(), e))?;
    if raw.trim().is_empty() {
        return Ok(None);
    }
    let parsed: TaskResult = serde_json::from_str(&raw)
        .map_err(|e| format!("task_result.json tidak valid: {}", e))?;
    Ok(Some(parsed))
}

/// Poll hasil misi. Idempotent: hasil yang sama tidak diproses dua kali.
pub fn poll_task_result(
    project_root: &Path,
    project_id: &str,
    blackboard: &BlackboardState,
) -> Result<MissionPollOutcome, String> {
    let Some(result) = read_task_result(project_root)? else {
        return Ok(MissionPollOutcome {
            processed: false,
            task_result: None,
            dag_status: None,
            message: "Belum ada .rig/context/task_result.json".to_string(),
        });
    };

    if result.task_id.trim().is_empty() {
        return Ok(MissionPollOutcome {
            processed: false,
            task_result: Some(result),
            dag_status: None,
            message: "task_result.json tidak memuat task_id — dilewati".to_string(),
        });
    }

    let fp = fingerprint(&result);
    let key = state_key(project_id);
    if blackboard.get_state(&key)?.as_deref() == Some(fp.as_str()) {
        return Ok(MissionPollOutcome {
            processed: false,
            task_result: Some(result),
            dag_status: None,
            message: "Hasil misi ini sudah diproses sebelumnya".to_string(),
        });
    }

    // 1. Update status di DAG (bila task-nya terdaftar)
    let dag_status = map_status(&result.status).to_string();
    let dag_updated = blackboard
        .update_task_status(&result.task_id, &dag_status, Some("conductor"))
        .ok()
        .map(|t| t.status);

    // 2. Catat audit event
    let payload = serde_json::json!({
        "task_id": result.task_id,
        "status": result.status,
        "agent_id": result.agent_id,
        "summary": result.summary,
        "artifacts": result.artifacts,
        "completed_at": result.completed_at,
        "dag_status": dag_status,
        "dag_updated": dag_updated.is_some(),
    })
    .to_string();
    blackboard.record_event(
        if result.agent_id.trim().is_empty() { "conductor" } else { &result.agent_id },
        "MISSION_RESULT_RECEIVED",
        &payload,
    )?;

    // 3. Suntikkan ke shared memory supaya 3 AI lain tahu hasilnya
    let mut lines = vec![format!(
        "Hasil misi {} → {} ({})",
        result.task_id,
        result.status.to_uppercase(),
        if result.agent_id.trim().is_empty() { "agen tidak disebut" } else { &result.agent_id }
    )];
    if !result.summary.trim().is_empty() {
        lines.push(result.summary.trim().to_string());
    }
    if !result.artifacts.is_empty() {
        lines.push(format!("Artefak: {}", result.artifacts.join(", ")));
    }
    let _ = crate::memory::append_entry(
        project_root,
        if result.agent_id.trim().is_empty() { "conductor" } else { &result.agent_id },
        "review",
        &lines.join("\n"),
    );

    // 4. Tandai sudah diproses
    blackboard.set_state(&key, &fp)?;

    Ok(MissionPollOutcome {
        processed: true,
        task_result: Some(result),
        dag_status: Some(dag_status),
        message: "Hasil misi diproses: DAG diperbarui, audit dicatat, journal disinkronkan".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_project(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("rigdeck-mission-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join(".rig").join("context")).unwrap();
        dir
    }

    fn write_result(root: &Path, body: &str) {
        fs::write(task_result_path(root), body).unwrap();
    }

    #[test]
    fn poll_processes_once_then_dedupes() {
        let root = temp_project("poll");
        let bb = BlackboardState::in_memory().unwrap();

        // Task terdaftar di DAG dengan ID yang sama seperti hasil misi
        let task = bb
            .create_task("Implement JWT", "detail", Some("antigravity"), None)
            .unwrap();

        write_result(
            &root,
            &format!(
                r#"{{"task_id":"{}","status":"COMPLETED","agent_id":"antigravity",
                     "summary":"JWT handler selesai + 12 test lulus",
                     "artifacts":["src/auth.rs"],"completed_at":"2026-10-06T16:00:00Z"}}"#,
                task.id
            ),
        );

        // 1. Poll pertama → diproses
        let first = poll_task_result(&root, "proj-1", &bb).unwrap();
        assert!(first.processed, "poll pertama harus memproses");
        assert_eq!(first.dag_status.as_deref(), Some("COMPLETED"));

        // 2. Task DAG benar-benar berubah status
        let updated = bb.get_task(&task.id).unwrap().unwrap();
        assert_eq!(updated.status, "COMPLETED");

        // 3. Event audit tercatat
        let events = bb.list_recent_events(20).unwrap();
        let ev = events
            .iter()
            .find(|e| e.event_type == "MISSION_RESULT_RECEIVED")
            .expect("event MISSION_RESULT_RECEIVED harus ada");
        assert_eq!(ev.agent_id, "antigravity");
        assert!(ev.payload.contains("JWT handler selesai"));

        // 4. Journal tersinkron (baca file mentah: summary ada di baris indentasi lanjutan,
        //    sedangkan journal_tail hanya mengembalikan baris bullet).
        let journal_dir = root.join("rig-memory").join("journal");
        let journal_text = fs::read_dir(&journal_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| fs::read_to_string(e.path()).unwrap_or_default())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(journal_text.contains("Hasil misi"));
        assert!(journal_text.contains("JWT handler selesai"));
        assert!(journal_text.contains("src/auth.rs"));

        // 5. Poll kedua dengan isi sama → tidak diproses ulang (dedupe)
        let second = poll_task_result(&root, "proj-1", &bb).unwrap();
        assert!(!second.processed, "hasil identik tidak boleh diproses dua kali");

        let events_after = bb.list_recent_events(50).unwrap();
        let count = events_after
            .iter()
            .filter(|e| e.event_type == "MISSION_RESULT_RECEIVED")
            .count();
        assert_eq!(count, 1, "tidak boleh ada event duplikat");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn poll_handles_failed_and_missing_result() {
        let root = temp_project("fail");
        let bb = BlackboardState::in_memory().unwrap();

        // 1. Belum ada file → processed=false, tidak error
        let none = poll_task_result(&root, "proj-2", &bb).unwrap();
        assert!(!none.processed);
        assert!(none.task_result.is_none());

        // 2. Status FAILED dipetakan ke DAG FAILED
        let task = bb.create_task("Rusak", "d", Some("chatgpt"), None).unwrap();
        write_result(
            &root,
            &format!(
                r#"{{"task_id":"{}","status":"FAILED","agent_id":"chatgpt","summary":"build gagal"}}"#,
                task.id
            ),
        );
        let out = poll_task_result(&root, "proj-2", &bb).unwrap();
        assert!(out.processed);
        assert_eq!(bb.get_task(&task.id).unwrap().unwrap().status, "FAILED");

        // 3. JSON rusak → error yang jelas, bukan panic
        fs::write(task_result_path(&root), "{ bukan json").unwrap();
        let err = poll_task_result(&root, "proj-2", &bb);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("tidak valid"));

        // 4. File kosong → dianggap belum ada
        fs::write(task_result_path(&root), "   ").unwrap();
        assert!(!poll_task_result(&root, "proj-2", &bb).unwrap().processed);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn result_for_unknown_task_still_audited() {
        let root = temp_project("unknown");
        let bb = BlackboardState::in_memory().unwrap();

        // task_id tidak ada di DAG — tetap dicatat sebagai audit, tanpa panic
        write_result(
            &root,
            r#"{"task_id":"RIG-TASK-TIDAK-ADA","status":"COMPLETED","agent_id":"claude","summary":"spec selesai"}"#,
        );
        let out = poll_task_result(&root, "proj-3", &bb).unwrap();
        assert!(out.processed);
        assert!(out.dag_status.is_some());

        let events = bb.list_recent_events(10).unwrap();
        assert!(events.iter().any(|e| e.event_type == "MISSION_RESULT_RECEIVED"));

        let _ = fs::remove_dir_all(&root);
    }
}
