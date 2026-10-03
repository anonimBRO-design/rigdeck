import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRigStore } from "../store/useRigStore";
import { LayoutMode } from "../types";
import {
  Layers,
  Columns,
  Grid,
  ShieldCheck,
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

  // Poll REAL 9Router status from Rust backend every 4 seconds
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
    { mode: "focus", icon: <Layers size={14} />, label: "Focus (1)" },
    { mode: "split", icon: <Columns size={14} />, label: "Split (2)" },
    { mode: "matrix", icon: <Grid size={14} />, label: "Matrix (4)" },
  ];

  return (
    <header className="h-12 border-b border-rig-border bg-rig-panel/90 px-4 flex items-center justify-between backdrop-blur-md">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-xs shadow-lg shadow-blue-500/20">
            RD
          </div>
          <div>
            <span className="font-bold tracking-tight text-slate-100 text-sm">RigDeck</span>
            <span className="text-[10px] text-blue-400 font-mono ml-2 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
              v1.1-LIVE
            </span>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-rig-border mx-1" />

        {/* Real-time 9Router Telemetry Pill */}
        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-full px-2.5 py-1 text-xs">
          <div
            className={`h-2 w-2 rounded-full ${
              routerHealth.online
                ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50"
                : "bg-red-400"
            }`}
          />
          <span className="text-slate-300 font-mono text-[11px]">9Router :20128</span>
          <span className="text-slate-500 font-mono text-[11px]">•</span>
          <span
            className={`font-mono text-[11px] ${
              routerHealth.online ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {routerHealth.online ? `${routerHealth.latency_ms}ms` : "Offline"}
          </span>
          <span className="text-slate-500 font-mono text-[11px]">•</span>
          <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
            <Zap size={11} className="text-amber-400" />
            {routerHealth.active_models_count} models loaded
          </span>
        </div>
      </div>

      {/* Right Controls: Layout Switcher & MCP Status */}
      <div className="flex items-center gap-3">
        {/* Layout Switcher */}
        <div className="flex items-center bg-slate-900/80 p-0.5 rounded-lg border border-slate-800">
          {layoutButtons.map((btn) => (
            <button
              key={btn.mode}
              onClick={() => setLayoutMode(btn.mode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                layoutMode === btn.mode
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              {btn.icon}
              <span className="hidden sm:inline">{btn.label}</span>
            </button>
          ))}
        </div>

        <div className="h-4 w-[1px] bg-rig-border" />

        {/* Universal MCP Hub Status */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded-lg">
          <ShieldCheck size={14} className="text-blue-400" />
          <span className="font-mono text-[11px]">MCP Hub (Active)</span>
        </div>
      </div>
    </header>
  );
};
