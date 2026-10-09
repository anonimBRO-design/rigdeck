import React, { useEffect, useMemo, useState } from "react";
import { useRigStore } from "../store/useRigStore";
import { AuditHistoryItem } from "../types";
import {
  listAuditEvents,
  toHistoryItems,
  agentLabel,
  copyJsonToClipboard,
  openJournalInObsidian,
} from "../services/history";
import { getMemoryStatus } from "../services/sharedMemory";
import { searchMessages } from "../services/mission";
import { SearchHit } from "../types";
import {
  X,
  History,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  Target,
  Activity,
  Loader2,
  Search,
} from "lucide-react";

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
}

type FilterKind = "all" | "mission" | "hitl" | "event";

const KIND_META: Record<
  AuditHistoryItem["kind"],
  { label: string; icon: React.ReactNode; accent: string; bg: string; border: string }
> = {
  mission: {
    label: "Mission",
    icon: <Target size={11} />,
    accent: "text-[#d97706]",
    bg: "bg-[#1a1714]",
    border: "border-[#2e261e]",
  },
  hitl: {
    label: "HITL",
    icon: <ShieldAlert size={11} />,
    accent: "text-[#ce9178]",
    bg: "bg-[#251e18]",
    border: "border-[#3e3422]",
  },
  event: {
    label: "Event",
    icon: <Activity size={11} />,
    accent: "text-[#007acc]",
    bg: "bg-[#141920]",
    border: "border-[#1e2734]",
  },
};

function formatTimestamp(ts: string): string {
  // Backend menyimpan "seconds.millisZ" — konversi ke Date yang valid.
  const numeric = Number(ts.replace("Z", ""));
  const d = Number.isFinite(numeric) && !Number.isNaN(numeric) ? new Date(numeric * 1000) : new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Pecah snippet FTS5 (penanda `<<` `>>`) menjadi elemen React yang aman. */
function renderSnippet(snippet: string): React.ReactNode[] {
  const parts = snippet.split(/(<<|>>)/);
  const nodes: React.ReactNode[] = [];
  let highlight = false;
  parts.forEach((part, i) => {
    if (part === "<<") {
      highlight = true;
      return;
    }
    if (part === ">>") {
      highlight = false;
      return;
    }
    if (!part) return;
    nodes.push(
      highlight ? (
        <mark key={i} className="bg-[#007acc]/30 text-[#e8e8e8] rounded px-0.5">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  });
  return nodes;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ open, onClose }) => {
  const { activeProject } = useRigStore();
  const [items, setItems] = useState<AuditHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [search, setSearch] = useState("");
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Tab: audit trail vs pencarian pesan lintas thread (FTS5)
  const [tab, setTab] = useState<"audit" | "messages">("audit");
  const [msgQuery, setMsgQuery] = useState("");
  const [msgHits, setMsgHits] = useState<SearchHit[]>([]);
  const [msgSearching, setMsgSearching] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const events = await listAuditEvents(300);
      setItems(toHistoryItems(events));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    getMemoryStatus().then((s) => setVaultPath(s?.vault_path ?? null));
  }, [open, activeProject?.id]);

  // Tutup modal dengan tombol Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Pencarian pesan lintas thread (debounced)
  useEffect(() => {
    if (!open || tab !== "messages") return;
    const q = msgQuery.trim();
    if (!q) {
      setMsgHits([]);
      setMsgSearching(false);
      return;
    }
    setMsgSearching(true);
    const timer = setTimeout(async () => {
      setMsgHits(await searchMessages(q, 50));
      setMsgSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [msgQuery, tab, open]);

  const counts = useMemo(
    () => ({
      all: items.length,
      mission: items.filter((i) => i.kind === "mission").length,
      hitl: items.filter((i) => i.kind === "hitl").length,
      event: items.filter((i) => i.kind === "event").length,
    }),
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (filter !== "all" && i.kind !== filter) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        i.detail.toLowerCase().includes(q) ||
        i.eventType.toLowerCase().includes(q) ||
        i.agentId.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const handleCopyJson = async () => {
    const ok = await copyJsonToClipboard(
      JSON.stringify(
        filtered.map((i) => ({
          id: i.id,
          kind: i.kind,
          agent: i.agentId,
          event_type: i.eventType,
          title: i.title,
          detail: i.detail,
          status: i.status ?? null,
          timestamp: i.timestamp,
          payload: i.payloadRaw,
        })),
        null,
        2
      )
    );
    setCopied(ok);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleOpenObsidian = async () => {
    if (!vaultPath) return;
    try {
      await openJournalInObsidian(vaultPath);
    } catch (err) {
      console.warn("Gagal membuka Obsidian:", err);
    }
  };

  if (!open) return null;

  const filterButtons: { key: FilterKind; label: string; count: number }[] = [
    { key: "all", label: "Semua", count: counts.all },
    { key: "mission", label: "Mission History", count: counts.mission },
    { key: "hitl", label: "HITL Interventions", count: counts.hitl },
    { key: "event", label: "System Events", count: counts.event },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] bg-[#161616] border border-[#2a2a2a] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#242424] bg-[#181818] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-[#222222] border border-[#303030] flex items-center justify-center text-[#007acc]">
              <History size={14} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-white tracking-wide">Audit History</h2>
              <p className="text-[10px] text-[#777777] font-mono mt-0.5">
                {activeProject?.name ?? "—"} • {counts.all} entri tercatat
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={refresh}
              title="Muat ulang audit trail"
              className="p-1.5 rounded text-[#777777] hover:text-[#cccccc] hover:bg-[#222222] transition-colors"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              title="Tutup (Esc)"
              className="p-1.5 rounded text-[#777777] hover:text-[#cccccc] hover:bg-[#222222] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tab switcher: Audit Trail vs Pesan lintas-thread */}
        <div className="px-4 pt-2 border-b border-[#242424] bg-[#181818] flex items-center gap-1 shrink-0">
          {([
            { key: "audit" as const, label: "Audit Trail" },
            { key: "messages" as const, label: "Cari Pesan" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-t-md text-[11px] font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-[#007acc] text-white bg-[#1e1e1e]"
                  : "border-transparent text-[#888888] hover:text-[#cccccc] hover:bg-[#1c1c1c]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters + Export */}
        {tab === "audit" && (
        <div className="px-4 py-2 border-b border-[#242424] bg-[#161616] flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center bg-[#1a1a1a] p-0.5 rounded-md border border-[#282828]">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  filter === f.key
                    ? "bg-[#282828] text-white border border-[#383838]"
                    : "text-[#888888] hover:text-[#cccccc] hover:bg-[#202020]"
                }`}
              >
                <span>{f.label}</span>
                <span className="text-[9px] font-mono text-[#666666]">{f.count}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-[140px] relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#555555]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari event, agent, task…"
              className="w-full bg-[#131313] border border-[#282828] rounded-md pl-7 pr-2 py-1 text-[11px] text-[#e0e0e0] placeholder:text-[#555555] focus:outline-none focus:border-[#007acc]"
            />
          </div>

          <button
            onClick={handleCopyJson}
            disabled={filtered.length === 0}
            title="Copy JSON audit ke clipboard"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#2e2e2e] text-[#a0a0a0] hover:text-white hover:bg-[#202020] disabled:opacity-30 transition-colors"
          >
            {copied ? <Check size={11} className="text-[#10b981]" /> : <Copy size={11} />}
            <span>{copied ? "Tersalin" : "Copy JSON"}</span>
          </button>

          <button
            onClick={handleOpenObsidian}
            disabled={!vaultPath}
            title={vaultPath ? `Buka ${vaultPath} di Obsidian` : "Vault belum terdeteksi"}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#2e2e2e] text-[#a0a0a0] hover:text-white hover:bg-[#202020] disabled:opacity-30 transition-colors"
          >
            <ExternalLink size={11} />
            <span>Obsidian</span>
          </button>
        </div>
        )}

        {/* Tab: pencarian pesan lintas thread (FTS5) */}
        {tab === "messages" && (
          <div className="px-4 py-2 border-b border-[#242424] bg-[#161616] shrink-0">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#555555]" />
              <input
                autoFocus
                value={msgQuery}
                onChange={(e) => setMsgQuery(e.target.value)}
                placeholder="Cari isi pesan di semua thread & project…"
                className="w-full bg-[#131313] border border-[#282828] rounded-md pl-7 pr-2 py-1.5 text-[11px] text-[#e0e0e0] placeholder:text-[#555555] focus:outline-none focus:border-[#007acc]"
              />
              {msgSearching && (
                <Loader2
                  size={11}
                  className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-[#007acc]"
                />
              )}
            </div>
          </div>
        )}

        {tab === "messages" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!msgQuery.trim() && (
              <div className="text-center py-10 text-[11px] text-[#666666]">
                Ketik untuk mencari isi semua percakapan.
                <br />
                <span className="text-[#555555]">
                  Pencarian memakai indeks FTS5 (prefix-match) dan mencakup seluruh thread di project ini.
                </span>
              </div>
            )}

            {msgQuery.trim() && !msgSearching && msgHits.length === 0 && (
              <div className="text-center py-10 text-[11px] text-[#666666]">
                Tidak ada pesan yang cocok dengan “{msgQuery.trim()}”.
              </div>
            )}

            {msgHits.map((hit) => (
              <div
                key={hit.message_id}
                className="p-2.5 rounded-lg border bg-[#141920] border-[#1e2734]"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold text-[#007acc]">
                    {hit.conversation_title}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#1f1f1f] text-[#888888] border border-[#2a2a2a]">
                    {agentLabel(hit.sender)}
                  </span>
                  <span className="text-[9px] font-mono text-[#555555] ml-auto">
                    {formatTimestamp(hit.created_at)}
                  </span>
                </div>
                <p className="text-[11px] text-[#b0b0b0] mt-1.5 leading-relaxed">
                  {renderSnippet(hit.snippet)}
                </p>
              </div>
            ))}

            {msgHits.length > 0 && (
              <div className="text-center text-[10px] font-mono text-[#555555] pt-2">
                {msgHits.length} pesan ditemukan
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        {tab === "audit" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && items.length === 0 && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#666666] px-1 py-6 justify-center">
              <Loader2 size={12} className="animate-spin text-[#007acc]" />
              <span>Memuat audit trail…</span>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 text-[11px] text-[#666666]">
              Belum ada entri untuk filter ini.
              <br />
              <span className="text-[#555555]">
                Delegasi misi & keputusan HITL akan otomatis tercatat di sini.
              </span>
            </div>
          )}

          {filtered.map((item) => {
            const meta = KIND_META[item.kind];
            const expanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setExpandedId(expanded ? null : item.id)}
                className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${meta.bg} ${meta.border} hover:brightness-125`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 shrink-0 ${meta.accent}`}>{meta.icon}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.accent}`}>
                        {meta.label}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#1f1f1f] text-[#888888] border border-[#2a2a2a]">
                        {agentLabel(item.agentId)}
                      </span>
                      <span className="text-[9px] font-mono text-[#555555]">{item.eventType}</span>
                      {item.status && (
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                            item.status === "REJECTED"
                              ? "text-[#ef4444] border-[#3a2222] bg-[#1e1616]"
                              : item.status === "APPROVED"
                                ? "text-[#10b981] border-[#1e2c24] bg-[#141c18]"
                                : "text-[#a0a0a0] border-[#2a2a2a] bg-[#1a1a1a]"
                          }`}
                        >
                          {item.status}
                        </span>
                      )}
                      <span className="text-[9px] font-mono text-[#555555] ml-auto shrink-0">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#d0d0d0] font-medium mt-1">
                      {item.title}
                    </div>

                    {item.detail && (
                      <p
                        className={`text-[10.5px] text-[#999999] mt-1 whitespace-pre-wrap ${
                          expanded ? "" : "line-clamp-2"
                        }`}
                      >
                        {item.detail}
                      </p>
                    )}

                    {expanded && (
                      <pre className="mt-2 p-2 rounded bg-[#101010] border border-[#242424] text-[10px] font-mono text-[#8a8a8a] overflow-x-auto whitespace-pre-wrap">
                        {item.payloadRaw}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        )}
        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#242424] bg-[#181818] flex items-center justify-between text-[10px] font-mono text-[#555555] shrink-0">
          {tab === "audit" ? (
            <>
              <span>Klik entri untuk melihat payload JSON mentah</span>
              <span>{filtered.length} / {counts.all} entri</span>
            </>
          ) : (
            <>
              <span>Pencarian full-text lintas thread (FTS5)</span>
              <span>{msgHits.length} hasil</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
