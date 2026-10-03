pub mod worktree;
pub mod router_client;

use std::path::PathBuf;
use tauri::command;
use worktree::{DiffResult, WorktreeManager};
use router_client::{check_router_health, RouterHealth};

#[command]
fn create_agent_worktree(branch: String) -> Result<String, String> {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mgr = WorktreeManager::new(current_dir);
    let path = mgr.create_worktree(&branch)?;
    Ok(path.to_string_lossy().to_string())
}

#[command]
fn inspect_agent_diff(branch: String) -> Result<DiffResult, String> {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mgr = WorktreeManager::new(current_dir);
    mgr.inspect_diff(&branch)
}

#[command]
fn remove_agent_worktree(branch: String) -> Result<(), String> {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mgr = WorktreeManager::new(current_dir);
    mgr.remove_worktree(&branch)
}

#[command]
async fn get_router_status() -> RouterHealth {
    check_router_health("http://127.0.0.1:20128/v1").await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            create_agent_worktree,
            inspect_agent_diff,
            remove_agent_worktree,
            get_router_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
