import React, { useEffect, useState } from "react";
import { Brain, ExternalLink, RefreshCw } from "lucide-react";
import {
  MemoryStatus,
  getJournalTail,
  getMemoryStatus,
  openVaultInObsidian,
} from "../services/sharedMemory";

const AGENT_STYLE: Record<string, string> = {
  conductor: "text-indigo-300 bg-indigo-500/10 border-indigo-500/30",
  claude: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  antigravity: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
  chatgpt: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  user: "text-blue-300 bg-blue-500/10 border-blue-500/30",
};

interface ParsedEntry {
  time: string;
  agent: string;
  kind: string;
  body: string;
}

/** Parse baris `- HH:MM **[agent]** `kind` — isi` dari journal. */
function parseEntry(line: string): ParsedEntry {
  const m = line.match(/^- (\S+) \*\*\[([^\]]+)\]\*\* `([^`]+)` — (.*)$/);
  if (!m) return { time: "", agent: "?", kind: "", body: line.replace(/^- /, "") };
  return { time: m[1], agent: m[2], kind: m[3], body: m[4] };
}

/** Feed live dari rig-memory/journal — ditulis oleh 4 AI. */
export const SharedMemoryFeed: React.FC = () => {
  const [entries, setEntries] = useState<string[]>([]);
  const [status, setStatus] = useState<MemoryStatus | null>(null);

  const refresh = async () => {
    setEntries(await getJournalTail(12));
    setStatus(await getMemoryStatus());
  };

  useEffect(() => {
    refresh();
    // Polling ringan: AI lain (Claude/Antigravity/ChatGPT) menulis file langsung ke disk.
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="shrink-0 border-t border-rig-border bg-slate-950/80 px-5 py-3 max-h-56 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-purple-400" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
            Shared Memory Feed
          </h3>
          <span className="text-[10px] font-mono text-slate-500">
            {status ? status.journal_today : "rig-memory/ belum aktif"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={refresh}
            title="Refresh"
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw size={12} />
          </button>
          {status && (
            <button
              onClick={() => openVaultInObsidian(status.vault_path).catch(console.warn)}
              title="Buka vault di Obsidian"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-purple-200 bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30"
            >
              <ExternalLink size={11} />
              Obsidian
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto space-y-1 pr-1">
        {entries.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">
            Belum ada entri hari ini. Kirim misi ke Master Conductor, atau minta Claude / Antigravity /
            ChatGPT menulis ke rig-memory/journal/.
          </p>
        ) : (
          entries.map((line, i) => {
            const e = parseEntry(line);
            return (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span className="font-mono text-slate-500 shrink-0 w-10">{e.time}</span>
                <span
                  className={`font-mono px-1.5 rounded border shrink-0 ${
                    AGENT_STYLE[e.agent] || "text-slate-300 bg-slate-800 border-slate-700"
                  }`}
                >
                  {e.agent}
                </span>
                {e.kind && <span className="font-mono text-slate-500 shrink-0">{e.kind}</span>}
                <span className="text-slate-300 break-words min-w-0">{e.body}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SharedMemoryFeed;
