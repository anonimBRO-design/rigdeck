use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub branch: String,
    pub path: String,
    pub is_clean: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffResult {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub raw_diff: String,
}

pub struct WorktreeManager {
    root_dir: PathBuf,
}

impl WorktreeManager {
    pub fn new<P: AsRef<Path>>(root_dir: P) -> Self {
        Self {
            root_dir: root_dir.as_ref().to_path_buf(),
        }
    }

    /// Creates an isolated worktree directory under .rig/worktrees/<branch>
    pub fn create_worktree(&self, branch_name: &str) -> Result<PathBuf, String> {
        let worktree_dir = self.root_dir.join(".rig").join("worktrees").join(branch_name);
        
        if worktree_dir.exists() {
            return Ok(worktree_dir);
        }

        // Ensure parent directory exists
        if let Some(parent) = worktree_dir.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let full_branch = format!("rig/{}", branch_name);
        let output = Command::new("git")
            .current_dir(&self.root_dir)
            .args([
                "worktree",
                "add",
                "-b",
                &full_branch,
                worktree_dir.to_str().unwrap_or(""),
                "main",
            ])
            .output()
            .map_err(|e| format!("Failed to spawn git worktree add: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git worktree add failed: {}", stderr));
        }

        Ok(worktree_dir)
    }

    /// Inspects diff between the agent's worktree branch and main
    pub fn inspect_diff(&self, branch_name: &str) -> Result<DiffResult, String> {
        let full_branch = format!("rig/{}", branch_name);
        let output = Command::new("git")
            .current_dir(&self.root_dir)
            .args(["diff", "main...", &full_branch])
            .output()
            .map_err(|e| format!("Failed to run git diff: {}", e))?;

        let raw_diff = String::from_utf8_lossy(&output.stdout).to_string();

        let stat_output = Command::new("git")
            .current_dir(&self.root_dir)
            .args(["diff", "--shortstat", "main...", &full_branch])
            .output()
            .map_err(|e| format!("Failed to run git diff --shortstat: {}", e))?;

        let stat_str = String::from_utf8_lossy(&stat_output.stdout);
        let (files, ins, del) = parse_shortstat(&stat_str);

        Ok(DiffResult {
            files_changed: files,
            insertions: ins,
            deletions: del,
            raw_diff,
        })
    }

    /// Removes the worktree safely after task completion
    pub fn remove_worktree(&self, branch_name: &str) -> Result<(), String> {
        let worktree_dir = self.root_dir.join(".rig").join("worktrees").join(branch_name);
        let output = Command::new("git")
            .current_dir(&self.root_dir)
            .args(["worktree", "remove", "--force", worktree_dir.to_str().unwrap_or("")])
            .output()
            .map_err(|e| format!("Failed to run git worktree remove: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git worktree remove failed: {}", stderr));
        }

        Ok(())
    }
}

fn parse_shortstat(stat: &str) -> (usize, usize, usize) {
    let mut files = 0;
    let mut insertions = 0;
    let mut deletions = 0;

    for part in stat.split(',') {
        let p = part.trim();
        if p.contains("file changed") || p.contains("files changed") {
            if let Some(num) = p.split_whitespace().next().and_then(|s| s.parse().ok()) {
                files = num;
            }
        } else if p.contains("insertion") {
            if let Some(num) = p.split_whitespace().next().and_then(|s| s.parse().ok()) {
                insertions = num;
            }
        } else if p.contains("deletion") {
            if let Some(num) = p.split_whitespace().next().and_then(|s| s.parse().ok()) {
                deletions = num;
            }
        }
    }

    (files, insertions, deletions)
}
