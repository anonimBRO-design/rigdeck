import React from "react";
import { useRigStore } from "../store/useRigStore";
import { GitPullRequest, Check, X, FileCode, CheckCircle2 } from "lucide-react";

export const DiffViewerModal: React.FC = () => {
  const { selectedDiffTask, setSelectedDiffTask, approveMergeTask } = useRigStore();

  if (!selectedDiffTask) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-4xl bg-rig-panel border border-rig-border rounded-xl shadow-2xl flex flex-col h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-rig-border flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <GitPullRequest size={18} className="text-amber-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <span>{selectedDiffTask.title}</span>
                <span className="text-[10px] font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
                  {selectedDiffTask.branchName}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Worktree isolated diff ready for two-tier merge review
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedDiffTask(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Diff Content Preview */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-[#0c1017] text-slate-300 space-y-4">
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <FileCode size={13} className="text-blue-400" />
                src/middleware/auth.ts
              </span>
              <span className="text-emerald-400 font-bold">+42 -3</span>
            </div>
            <div className="p-3 text-[11px] leading-relaxed">
              <div className="text-slate-500">@@ -15,8 +15,14 @@ export async function authMiddleware(req: Request) &#123;</div>
              <div className="text-slate-400">   const authHeader = req.headers.get("authorization");</div>
              <div className="text-red-400 bg-red-950/30 px-1">-  if (!authHeader) return new Response("Unauthorized", &#123; status: 401 &#125;);</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+  if (!authHeader?.startsWith("Bearer ")) &#123;</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+    return json(&#123; error: "Bearer token required" &#125;, &#123; status: 401 &#125;);</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+  &#125;</div>
              <div className="text-slate-400">   const token = authHeader.split(" ")[1];</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+  const payload = await verifyJwtToken(token, JWT_SECRET);</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+  req.user = payload.user;</div>
            </div>
          </div>

          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <FileCode size={13} className="text-blue-400" />
                tests/auth.test.ts
              </span>
              <span className="text-emerald-400 font-bold">+68 -0</span>
            </div>
            <div className="p-3 text-[11px] leading-relaxed">
              <div className="text-slate-500">@@ -0,0 +1,68 @@</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+import &#123; describe, it, expect &#125; from "vitest";</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+import &#123; verifyJwtToken &#125; from "../src/utils/jwt";</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+describe("JWT Auth Suite", () =&gt; &#123;</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+  it("rejects forged token signature", async () =&gt; &#123; ... &#125;);</div>
              <div className="text-emerald-400 bg-emerald-950/30 px-1">+&#125;);</div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-rig-border bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span>QA Test Suite Passed (14 tests) • No Security Vulnerabilities</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDiffTask(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => approveMergeTask(selectedDiffTask.id)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Check size={14} />
              Approve & Merge to Main Branch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
