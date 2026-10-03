import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRigStore } from "../store/useRigStore";
import { LayoutMode } from "../types";
import {
  Layers,
  Columns,
  Grid,
  Zap,
} from "lucide-react";

interface RouterHealthResponse {
  online: boolean;
  active_models_count: number;
  latency_ms: number;
}

export const Header: React.FC = () => {
  const { layoutMode, setLayoutMode } = useRigStore();
  const [routerHealth, setRouterHealth] = useState<RouterHealthResponse>({
    online: false,
    active_models_count: 0,
    latency_ms: 0,
  });

  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      try {
        const res = await invoke<RouterHealthResponse>("get_router_status");
        if (isMounted) {
          setRouterHealth(res);
        }
      } catch (e) {
        console.warn("9Router poll error:", e);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const layoutButtons: { mode: LayoutMode; icon: React.ReactNode; label: string }[] = [
    { mode: "focus", icon: <Layers size={13} />, label: "Focus (1)" },
    { mode: "split", icon: <Columns size={13} />, label: "Split (2)" },
    { mode: "matrix", icon: <Grid size={13} />, label: "Matrix (4)" },
  ];

  return (
    <header className="h-11 border-b border-[#262626] bg-[#161616] px-4 flex items-center justify-between">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-[#222222] border border-[#333333] flex items-center justify-center font-bold text-xs text-[#007acc]">
            RD
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-xs tracking-tight">RigDeck</span>
            <span className="text-[10px] text-[#888888] font-mono px-1.5 py-0.2 rounded bg-[#1f1f1f] border border-[#2e2e2e]">
              v1.1
            </span>
          </div>
        </div>

        <div className="h-3.5 w-[1px] bg-[#2a2a2a] mx-1" />

        {/* Real-time 9Router Telemetry Pill */}
        <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#282828] rounded-md px-2.5 py-0.5 text-xs">
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              routerHealth.online ? "bg-[#10b981]" : "bg-[#ef4444]"
            }`}
          />
          <span className="text-[#a0a0a0] font-mono text-[11px]">9Router :20128</span>
          <span className="text-[#444444] font-mono text-[11px]">•</span>
          <span
            className={`font-mono text-[11px] ${
              routerHealth.online ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {routerHealth.online ? `${routerHealth.latency_ms}ms` : "Offline"}
          </span>
          <span className="text-[#444444] font-mono text-[11px]">•</span>
          <span className="text-[#888888] font-mono text-[11px] flex items-center gap-1">
            <Zap size={10} className="text-[#a0a0a0]" />
            {routerHealth.active_models_count} models
          </span>
        </div>
      </div>

      {/* Right Controls: Layout Switcher */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-[#1a1a1a] p-0.5 rounded-md border border-[#282828]">
          {layoutButtons.map((btn) => (
            <button
              key={btn.mode}
              onClick={() => setLayoutMode(btn.mode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                layoutMode === btn.mode
                  ? "bg-[#282828] text-white border border-[#383838]"
                  : "text-[#888888] hover:text-[#cccccc] hover:bg-[#202020]"
              }`}
            >
              {btn.icon}
              <span className="hidden sm:inline text-[11px]">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

export default Header;
