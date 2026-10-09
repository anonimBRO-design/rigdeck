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

    /// Safely merges the worktree branch into base (default "main"),
    /// creates a merge commit, and removes the worktree.
    pub fn safe_merge(
        &self,
        branch_name: &str,
        target_branch: Option<&str>,
        commit_msg: Option<&str>,
    ) -> Result<MergeResult, String> {
        let base = target_branch.unwrap_or("main");
        let full_branch = if branch_name.starts_with("rig/") {
            branch_name.to_string()
        } else {
            format!("rig/{}", branch_name)
        };

        // 1. Checkout target branch in root
        let checkout_out = Command::new("git")
            .current_dir(&self.root_dir)
            .args(["checkout", base])
            .output()
            .map_err(|e| format!("git checkout {} failed: {}", base, e))?;

        if !checkout_out.status.success() {
            let stderr = String::from_utf8_lossy(&checkout_out.stderr);
            return Err(format!("Gagal checkout ke {}: {}", base, stderr));
        }

        // 2. Perform merge
        let default_msg = format!(
            "Merge branch '{}' into {} (Reviewed by Bg Codex, Implemented by Mbak Agy)",
            full_branch, base
        );
        let msg = commit_msg.unwrap_or(&default_msg);

        let merge_out = Command::new("git")
            .current_dir(&self.root_dir)
            .args(["merge", "--no-ff", "-m", msg, &full_branch])
            .output()
            .map_err(|e| format!("git merge failed: {}", e))?;

        if !merge_out.status.success() {
            let stderr = String::from_utf8_lossy(&merge_out.stderr);
            return Err(format!("git merge konflik atau gagal: {}", stderr));
        }

        // 3. Get latest commit hash
        let rev_out = Command::new("git")
            .current_dir(&self.root_dir)
            .args(["rev-parse", "--short", "HEAD"])
            .output()
            .map_err(|e| format!("rev-parse failed: {}", e))?;
        let commit_hash = String::from_utf8_lossy(&rev_out.stdout).trim().to_string();

        // 4. Remove worktree cleanly
        let clean_branch_name = branch_name.strip_prefix("rig/").unwrap_or(branch_name);
        let _ = self.remove_worktree(clean_branch_name);

        Ok(MergeResult {
            success: true,
            commit_hash,
            message: format!("Berhasil di-merge ke {} dengan commit [{}]!", base, msg),
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MergeResult {
    pub success: bool,
    pub commit_hash: String,
    pub message: String,
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
