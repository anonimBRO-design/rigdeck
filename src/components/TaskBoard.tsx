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
      if (items.length === 0) {
        // Seed initial tasks into SQLite Blackboard if table is empty
        await invoke("create_dag_task", {
          title: "Scaffold auth middleware & JWT signing",
          description: "Setup token parsing, cookie verification, and role guard",
          assignedAgent: "agent-coder",
          parentId: null,
        });
        await invoke("create_dag_task", {
          title: "Write unit & integration tests for auth",
          description: "Test expired tokens, invalid claims, and revocation",
          assignedAgent: "agent-tester",
          parentId: null,
        });
        await invoke("create_dag_task", {
          title: "Setup SQLite WAL state blackboard",
          description: "Create tables for tasks, agent events, and worktree locks",
          assignedAgent: "agent-arch",
          parentId: null,
        });
        const seeded = await invoke<DbTaskItem[]>("list_dag_tasks");
        setDbTasks(
          seeded.map((t, idx) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: idx === 0 ? "in_review" : idx === 1 ? "in_progress" : "done",
            assignedAgentId: t.assigned_agent || undefined,
            branchName: idx === 0 ? "rig/feat-auth" : idx === 1 ? "rig/test-auth" : "rig/db-blackboard",
            diffSummary: { filesChanged: 3 + idx, insertions: 40 * (idx + 1), deletions: 5 * idx },
          }))
        );
      } else {
        setDbTasks(
          items.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: mapDbStatusToTaskStatus(t.status),
            assignedAgentId: t.assigned_agent || undefined,
            branchName: t.assigned_agent ? `rig/${t.id}` : undefined,
            diffSummary: { filesChanged: 2, insertions: 35, deletions: 4 },
          }))
        );
      }
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
    <div className="flex flex-col h-full bg-rig-panel/60 border-r border-rig-border w-80 shrink-0">
      {/* Board Header */}
      <div className="p-3 border-b border-rig-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch size={15} className="text-blue-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Blackboard (SQLite WAL)
          </h2>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="p-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-all text-xs flex items-center gap-1 px-2 border border-blue-500/30"
        >
          <Plus size={13} />
          <span>New Task</span>
        </button>
      </div>

      {/* Task Columns List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {columns.map((col) => {
          const colTasks = dbTasks.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                <span className={`flex items-center gap-1.5 ${col.color}`}>
                  {col.icon}
                  {col.label}
                </span>
                <span className="bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
                  {colTasks.length}
                </span>
              </div>

              <div className="space-y-2">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-all cursor-pointer group shadow-sm"
                    onClick={() => task.diffSummary && setSelectedDiffTask(task)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-medium text-slate-200 group-hover:text-blue-400 transition-colors line-clamp-1">
                        {task.title}
                      </h4>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {task.id.slice(0, 10)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      {task.description}
                    </p>

                    {task.branchName && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span className="flex items-center gap-1 text-slate-400 truncate max-w-[140px]">
                          <GitBranch size={11} className="text-slate-500 shrink-0" />
                          {task.branchName}
                        </span>

                        {task.diffSummary && (
                          <span className="text-emerald-400 flex items-center gap-1">
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
        })}
      </div>

      {/* New Task Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md bg-rig-panel border border-rig-border rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-semibold text-slate-200">
              Create New Task in SQLite Blackboard
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Implement OAuth2 refresh token rotation"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Specification & Acceptance Criteria
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Detail instruction, expected unit tests, and security boundary..."
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20"
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
