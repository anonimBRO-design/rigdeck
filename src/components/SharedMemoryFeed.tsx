import React, { useEffect, useState } from "react";
import { Brain, ExternalLink, RefreshCw } from "lucide-react";
import {
  MemoryStatus,
  getJournalTail,
  getMemoryStatus,
  openVaultInObsidian,
} from "../services/sharedMemory";

const AGENT_STYLE: Record<string, string> = {
  conductor: "text-[#007acc] bg-[#182330] border-[#203042]",
  claude: "text-[#d97706] bg-[#221c14] border-[#33261a]",
  antigravity: "text-[#007acc] bg-[#182330] border-[#203042]",
  chatgpt: "text-[#10b981] bg-[#16241c] border-[#1f3427]",
  user: "text-[#cccccc] bg-[#222222] border-[#303030]",
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
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="shrink-0 border-t border-[#242424] bg-[#161616] px-4 py-2.5 max-h-48 flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-[#888888]" />
          <h3 className="text-[11px] font-semibold tracking-wide text-white">
            Shared Memory Feed
          </h3>
          <span className="text-[10px] font-mono text-[#666666]">
            {status ? status.journal_today : "rig-memory/ belum aktif"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={refresh}
            title="Refresh"
            className="p-1 rounded text-[#777777] hover:text-[#cccccc] hover:bg-[#202020]"
          >
            <RefreshCw size={11} />
          </button>
          {status && (
            <button
              onClick={() => openVaultInObsidian(status.vault_path).catch(console.warn)}
              title="Buka vault di Obsidian"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-[#cccccc] bg-[#222222] border border-[#303030] hover:bg-[#282828] transition-colors"
            >
              <ExternalLink size={10} />
              Obsidian
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto space-y-1 pr-1">
        {entries.length === 0 ? (
          <p className="text-[11px] text-[#666666] font-mono">
            Belum ada entri hari ini. Kirim misi ke Master Conductor untuk mencatat progres.
          </p>
        ) : (
          entries.map((line, i) => {
            const e = parseEntry(line);
            return (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span className="font-mono text-[#555555] shrink-0 w-10">{e.time}</span>
                <span
                  className={`font-mono text-[10px] px-1 rounded border shrink-0 ${
                    AGENT_STYLE[e.agent] || "text-[#888888] bg-[#202020] border-[#2c2c2c]"
                  }`}
                >
                  {e.agent}
                </span>
                {e.kind && <span className="font-mono text-[#666666] shrink-0">{e.kind}</span>}
                <span className="text-[#bbbbbb] break-words min-w-0">{e.body}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SharedMemoryFeed;
