/**
 * Git Operations & Safe Worktree Merge Service.
 */

import { invoke } from "@tauri-apps/api/core";

export interface MergeResult {
  success: boolean;
  commit_hash: string;
  message: string;
}

export interface DiffResult {
  files_changed: number;
  insertions: number;
  deletions: number;
  raw_diff: string;
}

/**
 * 1-Click Safe Merge: Merge branch worktree ke main branch dan bersihkan foldernya.
 */
export async function safeMergeWorktree(
  branch: string,
  targetBranch = "main",
  commitMsg?: string
): Promise<MergeResult> {
  return await invoke<MergeResult>("safe_merge_worktree", {
    branch,
    targetBranch: targetBranch ?? null,
    commitMsg: commitMsg ?? null,
  });
}

export async function inspectAgentDiff(branch: string): Promise<DiffResult> {
  return await invoke<DiffResult>("inspect_agent_diff", { branch });
}

export async function removeAgentWorktree(branch: string): Promise<void> {
  await invoke("remove_agent_worktree", { branch });
}
