import React from "react";
import { useRigStore } from "../store/useRigStore";
import { ShieldAlert, Check, X, Terminal } from "lucide-react";

export const HitlAlert: React.FC = () => {
  const { activeHitlAction, approveHitlAction, rejectHitlAction } = useRigStore();

  if (!activeHitlAction) return null;

  return (
    <div className="absolute bottom-4 right-4 z-40 max-w-lg w-full bg-slate-900 border-2 border-amber-500/80 rounded-xl p-4 shadow-2xl shadow-amber-500/10 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
          <ShieldAlert size={20} />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-300 tracking-wide uppercase">
              Action Intercepted (Human-In-The-Loop)
            </h4>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              {activeHitlAction.riskLevel.toUpperCase()} RISK
            </span>
          </div>

          <p className="text-xs text-slate-300 mt-1">
            <span className="font-semibold text-white">{activeHitlAction.agentName}</span>{" "}
            {activeHitlAction.description}
          </p>

          <div className="mt-2.5 p-2 rounded-md bg-black/60 border border-slate-800 font-mono text-[11px] text-amber-200/90 flex items-center gap-2">
            <Terminal size={12} className="text-slate-500 shrink-0" />
            <span className="truncate">{activeHitlAction.command}</span>
          </div>

          <div className="flex items-center justify-end gap-2 mt-3.5">
            <button
              onClick={() => rejectHitlAction(activeHitlAction.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <X size={13} />
              Reject & Abort [N]
            </button>
            <button
              onClick={() => approveHitlAction(activeHitlAction.id)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all"
            >
              <Check size={13} />
              Authorize Action [Y]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
