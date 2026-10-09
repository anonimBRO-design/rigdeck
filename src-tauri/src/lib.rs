pub mod app_bridge;
pub mod blackboard;
pub mod memory;
pub mod mission;
pub mod project;
pub mod pty;
pub mod router_client;
pub mod worktree;

use blackboard::{
    AgentEvent, BlackboardState, ConductorMessage, Conversation, SearchHit, TaskItem,
};
use project::{
    add_or_open_project_internal, get_default_project_root, init_project_state,
    list_projects as registry_list_projects, load_registry, switch_project_internal,
    ProjectItem, ProjectState,
};
use pty::PtyState;
use router_client::{check_router_health, RouterHealth};
use std::path::PathBuf;
use tauri::{command, AppHandle, State};
use worktree::{DiffResult, WorktreeManager};

// ----------------------------------------------------------------------------
// Project Management Commands
// ----------------------------------------------------------------------------
#[command]
fn list_projects() -> Vec<ProjectItem> {
    registry_list_projects()
}

#[command]
fn get_current_project(project_state: State<ProjectState>) -> Result<ProjectItem, String> {
    let reg = load_registry();
    let current_id = project_state.get_current_project_id();
    if let Some(p) = reg.projects.into_iter().find(|p| p.id == current_id) {
        Ok(p)
    } else {
        Err("No active project found".to_string())
    }
}

#[command]
fn switch_project(
    project_state: State<ProjectState>,
    blackboard_state: State<BlackboardState>,
    project_id: String,
) -> Result<ProjectItem, String> {
    switch_project_internal(&project_state, &blackboard_state, &project_id)
}

#[command]
fn add_or_open_project(
    project_state: State<ProjectState>,
    blackboard_state: State<BlackboardState>,
    path: String,
    name: Option<String>,
) -> Result<ProjectItem, String> {
    add_or_open_project_internal(&project_state, &blackboard_state, &path, name)
}

#[command]
async fn pick_project_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    // Pakai plugin dialog resmi Tauri.
    //
    // SEBELUMNYA (diperbaiki 9 Okt 2026):
    //   Windows : System.Windows.Forms.FolderBrowserDialog — dialog era XP,
    //             tidak bisa ketik path, tampilan ketinggalan zaman.
    //   Linux   : spawn `zenity` — bergantung program luar.
    //
    // SEKARANG: satu pemanggilan, dialog NATIVE di dua OS
    // (Windows 11 style di Windows, GTK di Linux), bisa ketik path.
    use tauri_plugin_dialog::DialogExt;

    let hasil = app
        .dialog()
        .file()
        .set_title("Pilih Direktori Proyek RigDeck")
        .blocking_pick_folder();

    match hasil {
        Some(p) => Ok(p.as_path().map(|x| x.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

// ----------------------------------------------------------------------------
// Multi-Session Conversation Commands
// ----------------------------------------------------------------------------
#[command]
fn create_conversation(
    state: State<BlackboardState>,
    project_id: String,
    title: String,
    model: String,
) -> Result<Conversation, String> {
    state.create_conversation(&project_id, &title, &model)
}

#[command]
fn list_conversations(
    state: State<BlackboardState>,
    project_id: String,
) -> Result<Vec<Conversation>, String> {
    state.list_conversations(&project_id)
}

#[command]
fn get_conversation_messages(
    state: State<BlackboardState>,
    conversation_id: String,
) -> Result<Vec<ConductorMessage>, String> {
    state.get_conversation_messages(&conversation_id)
}

#[command]
fn save_message(
    state: State<BlackboardState>,
    msg: ConductorMessage,
) -> Result<(), String> {
    state.save_message(msg)
}

#[command]
fn delete_conversation(
    state: State<BlackboardState>,
    conversation_id: String,
) -> Result<(), String> {
    state.delete_conversation(&conversation_id)
}

#[command]
fn rename_conversation(
    state: State<BlackboardState>,
    conversation_id: String,
    new_title: String,
) -> Result<(), String> {
    state.rename_conversation(&conversation_id, &new_title)
}

#[command]
fn search_conversation_messages(
    state: State<BlackboardState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    state.search_messages(&query, limit.unwrap_or(20))
}

#[command]
fn count_indexed_messages(state: State<BlackboardState>) -> Result<i64, String> {
    state.indexed_message_count()
}

// ----------------------------------------------------------------------------
// Mission Result Loop (penutup loop delegasi)
// ----------------------------------------------------------------------------
#[command]
fn poll_mission_result(
    project_state: State<ProjectState>,
    blackboard_state: State<BlackboardState>,
) -> Result<mission::MissionPollOutcome, String> {
    let root = project_state.get_current_root();
    let project_id = project_state.get_current_project_id();
    mission::poll_task_result(&root, &project_id, &blackboard_state)
}

#[command]
fn peek_mission_result(
    project_state: State<ProjectState>,
) -> Result<Option<mission::TaskResult>, String> {
    mission::read_task_result(&project_state.get_current_root())
}

// ----------------------------------------------------------------------------
// Handoff Export (percakapan → rig-memory/handoffs/)
// ----------------------------------------------------------------------------
#[command]
fn export_conversation_handoff(
    project_state: State<ProjectState>,
    title: String,
    conversation_id: String,
    messages: Vec<memory::HandoffMessage>,
    target_agents: Option<Vec<String>>,
) -> Result<String, String> {
    let root = project_state.get_current_root();
    memory::write_handoff(
        &root,
        &title,
        &messages,
        &target_agents.unwrap_or_default(),
        &conversation_id,
    )
}

// ----------------------------------------------------------------------------
// Worktree Commands
// ----------------------------------------------------------------------------
#[command]
fn create_agent_worktree(
    project_state: State<ProjectState>,
    branch: String,
) -> Result<String, String> {
    let root = project_state.get_current_root();
    let mgr = WorktreeManager::new(root);
    let path = mgr.create_worktree(&branch)?;
    Ok(path.to_string_lossy().to_string())
}

#[command]
fn inspect_agent_diff(
    project_state: State<ProjectState>,
    branch: String,
) -> Result<DiffResult, String> {
    let root = project_state.get_current_root();
    let mgr = WorktreeManager::new(root);
    mgr.inspect_diff(&branch)
}

#[command]
fn remove_agent_worktree(
    project_state: State<ProjectState>,
    branch: String,
) -> Result<(), String> {
    let root = project_state.get_current_root();
    let mgr = WorktreeManager::new(root);
    mgr.remove_worktree(&branch)
}

#[command]
fn safe_merge_worktree(
    project_state: State<ProjectState>,
    branch: String,
    target_branch: Option<String>,
    commit_msg: Option<String>,
) -> Result<worktree::MergeResult, String> {
    let root = project_state.get_current_root();
    let mgr = WorktreeManager::new(root);
    mgr.safe_merge(&branch, target_branch.as_deref(), commit_msg.as_deref())
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
fn get_dag_task(
    state: State<BlackboardState>,
    task_id: String,
) -> Result<Option<TaskItem>, String> {
    state.get_task(&task_id)
}

#[command]
fn list_dag_tasks(state: State<BlackboardState>) -> Result<Vec<TaskItem>, String> {
    state.list_tasks()
}

#[command]
fn update_dag_task_status(
    state: State<BlackboardState>,
    task_id: String,
    status: String,
    agent_id: Option<String>,
) -> Result<TaskItem, String> {
    state.update_task_status(&task_id, &status, agent_id.as_deref())
}

#[command]
fn assign_dag_task(
    state: State<BlackboardState>,
    task_id: String,
    agent_id: String,
) -> Result<TaskItem, String> {
    state.assign_task(&task_id, &agent_id)
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
// GUI App Bridge Commands (Desktop Window Control & Deep Links)
// ----------------------------------------------------------------------------
#[command]
fn focus_gui_window(app_name: String) -> Result<bool, String> {
    app_bridge::focus_app_window(&app_name)
}

#[command]
fn dispatch_gui_url(url: String) -> Result<(), String> {
    app_bridge::dispatch_url_scheme(&url)
}

#[command]
fn write_pointer_task_file(
    project_state: State<ProjectState>,
    task_payload_json: String,
) -> Result<String, String> {
    let root = project_state.get_current_root();
    let path = app_bridge::write_pointer_task_file(&root, &task_payload_json)?;
    Ok(path.to_string_lossy().to_string())
}

#[command]
fn dispatch_claude_pointer_task(
    project_state: State<ProjectState>,
    task_payload_json: String,
    prompt: Option<String>,
    auto_submit: Option<bool>,
) -> Result<String, String> {
    let root = project_state.get_current_root();
    app_bridge::dispatch_claude_pointer_task(&root, &task_payload_json, prompt, auto_submit)
}

#[command]
fn inject_gui_prompt(
    project_state: State<ProjectState>,
    app_name: String,
    prompt: String,
    auto_submit: Option<bool>,
) -> Result<bool, String> {
    let root = project_state.get_current_root();
    app_bridge::inject_prompt_to_gui(&root, &app_name, &prompt, auto_submit.unwrap_or(false))
}

// ----------------------------------------------------------------------------
// Shared Memory Vault (rig-memory/) — dibaca & ditulis oleh 4 AI
// ----------------------------------------------------------------------------
#[command]
fn memory_status(project_state: State<ProjectState>) -> Result<memory::MemoryStatus, String> {
    memory::status(&project_state.get_current_root())
}

#[command]
fn memory_read_context(
    project_state: State<ProjectState>,
    max_chars: Option<usize>,
) -> Result<String, String> {
    memory::read_context(&project_state.get_current_root(), max_chars.unwrap_or(12_000))
}

#[command]
fn memory_append(
    project_state: State<ProjectState>,
    agent: String,
    kind: String,
    content: String,
) -> Result<String, String> {
    memory::append_entry(&project_state.get_current_root(), &agent, &kind, &content)
}

#[command]
fn memory_journal_tail(
    project_state: State<ProjectState>,
    lines: Option<usize>,
) -> Result<Vec<String>, String> {
    memory::journal_tail(&project_state.get_current_root(), lines.unwrap_or(20))
}

#[command]
fn memory_list_notes(
    project_state: State<ProjectState>,
) -> Result<Vec<memory::MemoryNote>, String> {
    memory::list_notes(&project_state.get_current_root())
}

#[command]
fn memory_read_note(
    project_state: State<ProjectState>,
    path: String,
) -> Result<String, String> {
    memory::read_note(&project_state.get_current_root(), &path)
}

// ----------------------------------------------------------------------------
// Main Application Entrypoint
// ----------------------------------------------------------------------------
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let default_root = get_default_project_root();
    let (project_state, active_project) = init_project_state(&default_root);

    let active_root = PathBuf::from(&active_project.path);
    let db_path = active_root.join(".rig").join("blackboard.db");

    let blackboard_state = BlackboardState::new(&db_path)
        .expect("Failed to initialize RigDeck blackboard SQLite in WAL mode");

    if let Err(e) = memory::ensure_vault(&active_root) {
        eprintln!("[rigdeck] Gagal menyiapkan shared memory vault: {}", e);
    }

    let pty_state = PtyState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        // dialog native untuk pilih folder (Windows 11 style / GTK)
        .plugin(tauri_plugin_dialog::init())
        .manage(project_state)
        .manage(pty_state)
        .manage(blackboard_state)
        .invoke_handler(tauri::generate_handler![
            // Projects
            list_projects,
            get_current_project,
            switch_project,
            add_or_open_project,
            pick_project_folder,
            // Conversations
            create_conversation,
            list_conversations,
            get_conversation_messages,
            save_message,
            delete_conversation,
            rename_conversation,
            search_conversation_messages,
            count_indexed_messages,
            // Mission Result Loop
            poll_mission_result,
            peek_mission_result,
            // Handoff Export
            export_conversation_handoff,
            // GUI App Focus & Deep Links
            focus_gui_window,
            dispatch_gui_url,
            write_pointer_task_file,
            dispatch_claude_pointer_task,
            inject_gui_prompt,
            // Shared Memory
            memory_status,
            memory_read_context,
            memory_append,
            memory_journal_tail,
            memory_list_notes,
            memory_read_note,
            // Worktree
            create_agent_worktree,
            inspect_agent_diff,
            remove_agent_worktree,
            safe_merge_worktree,
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
