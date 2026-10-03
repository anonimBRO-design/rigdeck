import React from "react";
import { useRigStore } from "../store/useRigStore";
import { ShieldAlert, Check, X, Terminal } from "lucide-react";

export const HitlAlert: React.FC = () => {
  const { activeHitlAction, approveHitlAction, rejectHitlAction } = useRigStore();

  if (!activeHitlAction) return null;

  return (
    <div className="absolute bottom-4 right-4 z-40 max-w-lg w-full bg-[#181818] border border-[#ce9178]/70 rounded-xl p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded bg-[#251e18] border border-[#3e3422] text-[#ce9178] shrink-0">
          <ShieldAlert size={18} />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[#ce9178] tracking-wide uppercase">
              Action Intercepted (Human-In-The-Loop)
            </h4>
            <span className="text-[10px] font-mono text-[#ce9178] bg-[#251e18] px-1.5 py-0.5 rounded border border-[#3e3422]">
              {activeHitlAction.riskLevel.toUpperCase()} RISK
            </span>
          </div>

          <p className="text-xs text-[#cccccc] mt-1">
            <span className="font-semibold text-white">{activeHitlAction.agentName}</span>{" "}
            {activeHitlAction.description}
          </p>

          <div className="mt-2.5 p-2 rounded bg-[#121212] border border-[#282828] font-mono text-[11px] text-[#cccccc] flex items-center gap-2">
            <Terminal size={12} className="text-[#666666] shrink-0" />
            <span className="truncate">{activeHitlAction.command}</span>
          </div>

          <div className="flex items-center justify-end gap-2 mt-3.5">
            <button
              onClick={() => rejectHitlAction(activeHitlAction.id)}
              className="px-3 py-1.5 rounded text-xs font-medium text-[#888888] hover:bg-[#252525] border border-[#2e2e2e] transition-colors flex items-center gap-1.5"
            >
              <X size={13} />
              Reject & Abort [N]
            </button>
            <button
              onClick={() => approveHitlAction(activeHitlAction.id)}
              className="px-3.5 py-1.5 rounded text-xs font-medium bg-rig-accent hover:bg-rig-accentHover text-white flex items-center gap-1.5 transition-all"
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
