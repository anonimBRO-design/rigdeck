pub mod blackboard;
pub mod pty;
pub mod router_client;
pub mod worktree;

use blackboard::{default_blackboard_path, AgentEvent, BlackboardState, TaskItem};
use pty::PtyState;
use router_client::{check_router_health, RouterHealth};
use std::path::PathBuf;
use tauri::{command, AppHandle, State};
use worktree::{DiffResult, WorktreeManager};

fn get_project_root() -> PathBuf {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if current_dir.ends_with("src-tauri") {
        current_dir.parent().unwrap_or(&current_dir).to_path_buf()
    } else {
        current_dir
    }
}

// ----------------------------------------------------------------------------
// Worktree Commands
// ----------------------------------------------------------------------------
#[command]
fn create_agent_worktree(branch: String) -> Result<String, String> {
    let root = get_project_root();
    let mgr = WorktreeManager::new(root);
    let path = mgr.create_worktree(&branch)?;
    Ok(path.to_string_lossy().to_string())
}

#[command]
fn inspect_agent_diff(branch: String) -> Result<DiffResult, String> {
    let root = get_project_root();
    let mgr = WorktreeManager::new(root);
    mgr.inspect_diff(&branch)
}

#[command]
fn remove_agent_worktree(branch: String) -> Result<(), String> {
    let root = get_project_root();
    let mgr = WorktreeManager::new(root);
    mgr.remove_worktree(&branch)
}

// ----------------------------------------------------------------------------
// 9Router Health Command
// ----------------------------------------------------------------------------
#[command]
async fn get_router_status() -> RouterHealth {
    check_router_health("http://127.0.0.1:20128/v1").await
}

// ----------------------------------------------------------------------------
// PTY (Terminal Stream) Commands
// ----------------------------------------------------------------------------
#[command]
fn spawn_pty(
    app: AppHandle,
    state: State<PtyState>,
    agent_id: String,
    cmd: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<(), String> {
    let cwd_path = cwd.map(PathBuf::from);
    let cmd_args = args.unwrap_or_default();
    state.spawn(
        app,
        agent_id,
        cmd,
        cmd_args,
        cwd_path,
        rows.unwrap_or(24),
        cols.unwrap_or(80),
    )
}

#[command]
fn write_pty(state: State<PtyState>, agent_id: String, data: String) -> Result<(), String> {
    state.write(&agent_id, &data)
}

#[command]
fn resize_pty(
    state: State<PtyState>,
    agent_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.resize(&agent_id, rows, cols)
}

#[command]
fn kill_pty(state: State<PtyState>, agent_id: String) -> Result<(), String> {
    state.kill(&agent_id)
}

// ----------------------------------------------------------------------------
// Blackboard (Hub-and-Spoke SQLite) Commands
// ----------------------------------------------------------------------------
#[command]
fn create_dag_task(
    state: State<BlackboardState>,
    title: String,
    description: Option<String>,
    assigned_agent: Option<String>,
    parent_id: Option<String>,
) -> Result<TaskItem, String> {
    state.create_task(
        &title,
        &description.unwrap_or_default(),
        assigned_agent.as_deref(),
        parent_id.as_deref(),
    )
}

#[command]
fn get_dag_task(state: State<BlackboardState>, id: String) -> Result<Option<TaskItem>, String> {
    state.get_task(&id)
}

#[command]
fn list_dag_tasks(state: State<BlackboardState>) -> Result<Vec<TaskItem>, String> {
    state.list_tasks()
}

#[command]
fn update_dag_task_status(
    state: State<BlackboardState>,
    id: String,
    status: String,
    agent_id: Option<String>,
) -> Result<TaskItem, String> {
    state.update_task_status(&id, &status, agent_id.as_deref())
}

#[command]
fn assign_dag_task(
    state: State<BlackboardState>,
    id: String,
    agent_id: String,
) -> Result<TaskItem, String> {
    state.assign_task(&id, &agent_id)
}

#[command]
fn record_dag_event(
    state: State<BlackboardState>,
    agent_id: String,
    event_type: String,
    payload: String,
) -> Result<AgentEvent, String> {
    state.record_event(&agent_id, &event_type, &payload)
}

#[command]
fn list_dag_events(
    state: State<BlackboardState>,
    limit: Option<usize>,
) -> Result<Vec<AgentEvent>, String> {
    state.list_recent_events(limit.unwrap_or(50))
}

// ----------------------------------------------------------------------------
// Main Application Entrypoint
// ----------------------------------------------------------------------------
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pty_state = PtyState::new();
    let db_path = default_blackboard_path();
    let blackboard_state = BlackboardState::new(db_path)
        .expect("Failed to initialize RigDeck blackboard SQLite in WAL mode");

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(pty_state)
        .manage(blackboard_state)
        .invoke_handler(tauri::generate_handler![
            // Worktree
            create_agent_worktree,
            inspect_agent_diff,
            remove_agent_worktree,
            // 9Router
            get_router_status,
            // PTY
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            // Blackboard
            create_dag_task,
            get_dag_task,
            list_dag_tasks,
            update_dag_task_status,
            assign_dag_task,
            record_dag_event,
            list_dag_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
