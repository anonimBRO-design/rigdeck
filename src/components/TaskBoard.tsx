import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRigStore } from "../store/useRigStore";
import { Task, TaskStatus } from "../types";
import {
  GitPullRequest,
  CheckCircle2,
  Clock,
  Plus,
  GitBranch,
  FileCode2,
} from "lucide-react";

interface DbTaskItem {
  id: string;
  title: string;
  description: string;
  status: string;
  assigned_agent: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export const TaskBoard: React.FC = () => {
  const { setSelectedDiffTask } = useRigStore();
  const [dbTasks, setDbTasks] = useState<Task[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const mapDbStatusToTaskStatus = (status: string): TaskStatus => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
      case "DONE":
        return "done";
      case "IN_REVIEW":
      case "READY_FOR_TEST":
        return "in_review";
      case "IN_PROGRESS":
        return "in_progress";
      default:
        return "backlog";
    }
  };

  const fetchTasks = useCallback(async () => {
    try {
      const items = await invoke<DbTaskItem[]>("list_dag_tasks");
      setDbTasks(
        items.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: mapDbStatusToTaskStatus(t.status),
          assignedAgentId: t.assigned_agent || undefined,
          branchName: t.assigned_agent ? `rig/${t.id}` : undefined,
          diffSummary: undefined,
        }))
      );
    } catch (e) {
      console.warn("Failed to fetch SQLite tasks:", e);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await invoke("create_dag_task", {
        title: title.trim(),
        description: desc.trim(),
        assignedAgent: "agent-coder",
        parentId: null,
      });
      await fetchTasks();
    } catch (err) {
      console.error("Failed to create task in SQLite:", err);
    }

    setTitle("");
    setDesc("");
    setShowNewModal(false);
  };

  const columns: { status: TaskStatus; label: string; icon: React.ReactNode; color: string }[] = [
    { status: "in_progress", label: "In Progress (Worktree)", icon: <Clock size={13} />, color: "text-blue-400" },
    { status: "in_review", label: "In Review (QA / Diff)", icon: <GitPullRequest size={13} />, color: "text-amber-400" },
    { status: "done", label: "Completed & Merged", icon: <CheckCircle2 size={13} />, color: "text-emerald-400" },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#141414] overflow-hidden select-none">
      {/* Board Header */}
      <div className="p-3 bg-[#161616] border-b border-[#282828] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={15} className="text-rig-accent" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#cccccc]">
            Blackboard Tasks
          </h2>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="p-1 rounded bg-[#202020] text-[#cccccc] hover:bg-[#282828] transition-colors text-xs flex items-center gap-1 px-2 border border-[#2e2e2e]"
        >
          <Plus size={13} />
          <span>New Task</span>
        </button>
      </div>

      {/* Task Columns List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {dbTasks.length === 0 ? (
          <div className="py-12 px-3 text-center text-[#666666]">
            <GitBranch size={24} className="mx-auto mb-2 text-[#444444]" />
            <p className="text-xs font-medium text-[#888888]">Belum ada task aktif</p>
            <p className="text-[11px] mt-1 text-[#555555]">
              Buat task baru dengan tombol di atas atau delegasikan misi dari Conductor.
            </p>
          </div>
        ) : (
          columns.map((col) => {
            const colTasks = dbTasks.filter((t) => t.status === col.status);
            return (
              <div key={col.status} className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#888888] uppercase tracking-wider px-1">
                  <span className={`flex items-center gap-1.5 ${col.color}`}>
                    {col.icon}
                    {col.label}
                  </span>
                  <span className="bg-[#202020] text-[#cccccc] px-1.5 py-0.2 rounded text-[10px] font-mono border border-[#2e2e2e]">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-2.5 rounded bg-[#181818] border border-[#282828] hover:border-[#383838] transition-colors cursor-pointer group"
                      onClick={() => task.diffSummary && setSelectedDiffTask(task)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-medium text-[#f3f3f3] group-hover:text-rig-accent transition-colors line-clamp-1">
                          {task.title}
                        </h4>
                        <span className="text-[10px] font-mono text-[#666666] shrink-0">
                          {task.id.slice(0, 10)}
                        </span>
                      </div>

                      <p className="text-[11px] text-[#888888] mt-1 line-clamp-2">
                        {task.description}
                      </p>

                      {task.branchName && (
                        <div className="mt-2.5 pt-2 border-t border-[#242424] flex items-center justify-between text-[10px] font-mono text-[#888888]">
                          <span className="flex items-center gap-1 text-[#888888] truncate max-w-[140px]">
                            <GitBranch size={11} className="text-[#666666] shrink-0" />
                            {task.branchName}
                          </span>

                          {task.diffSummary && (
                            <span className="text-[#4ec9b0] flex items-center gap-1">
                              <FileCode2 size={11} />
                              +{task.diffSummary.insertions} -{task.diffSummary.deletions}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Task Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md bg-[#181818] border border-[#282828] rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-semibold text-[#f3f3f3]">
              Create New Task in SQLite Blackboard
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-[#888888] block mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Implement OAuth2 refresh token rotation"
                  className="w-full bg-[#121212] border border-[#333333] rounded px-3 py-1.5 text-xs text-[#f3f3f3] focus:outline-none focus:border-rig-accent"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#888888] block mb-1">
                  Specification & Acceptance Criteria
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Detail instruction, expected unit tests, and security boundary..."
                  rows={3}
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2.5 text-xs text-[#f3f3f3] focus:outline-none focus:border-rig-accent resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#242424]">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded text-xs font-medium text-[#888888] hover:bg-[#252525] border border-[#2e2e2e]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded text-xs font-medium bg-rig-accent hover:bg-rig-accentHover text-white"
              >
                Save to SQLite & Dispatch
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
