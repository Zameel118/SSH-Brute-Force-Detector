import { useEffect, useState } from "react";
import { Copy, FolderOpen, Play, ShieldBan, ShieldOff } from "lucide-react";
import { formatDuration, formatTime } from "./StatusBadge";

export default function BlockedPanel({
  blocked,
  onUnblock,
  busyIp,
  onCopyIp,
  onReplayIp,
  onCreateCase,
  caseBusyIp,
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className={`panel overflow-hidden h-full flex flex-col ${blocked.length ? "panel-live-hot" : ""}`}>
      <div className="panel-header">
        <h2 className="panel-title flex items-center gap-2">
          <ShieldBan className="w-3.5 h-3.5 text-signal-danger" strokeWidth={1.75} aria-hidden />
          Blocked / Rate-Limited
        </h2>
        <span className="font-mono text-2xs text-chalk-muted tabular-nums">
          {blocked.length}
          {blocked.length > 0 && <span className="live-dot live-dot-on !w-1.5 !h-1.5 ml-2 align-middle" />}
        </span>
      </div>

      <div className="p-0 max-h-[360px] overflow-y-auto flex-1">
        {blocked.length === 0 && (
          <p className="text-sm text-chalk-muted px-3 py-8 text-center">No active containment</p>
        )}
        {blocked.map((row) => {
          const exp = row.expires_at ? new Date(row.expires_at).getTime() : NaN;
          const remaining = Number.isNaN(exp)
            ? row.seconds_remaining || 0
            : Math.max(0, Math.floor((exp - now) / 1000));
          const caseBusy = caseBusyIp === row.ip_address;
          return (
            <div
              key={row.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-3 border-b border-ink-line"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onCopyIp?.(row.ip_address)}
                  className="font-mono text-sm text-signal-danger inline-flex items-center gap-1.5 hover:underline"
                  title="Copy IP"
                >
                  {row.ip_address}
                  <Copy className="w-3 h-3 opacity-50" strokeWidth={1.75} aria-hidden />
                </button>
                <div className="text-2xs text-chalk-muted mt-1 font-mono">
                  <span
                    className={
                      row.stage === "blocked" ? "text-signal-danger" : "text-signal-alert"
                    }
                  >
                    {row.stage}
                  </span>
                  <span className="text-chalk-faint"> · </span>
                  TTL {formatDuration(remaining)}
                  <span className="text-chalk-faint"> · </span>
                  since {formatTime(row.blocked_at)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onReplayIp?.(row.ip_address)}
                  className="btn-console !px-2"
                  title="Replay session"
                >
                  <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => onCreateCase?.(row.ip_address)}
                  disabled={caseBusy}
                  className="btn-console !px-2"
                  title="Create Case File"
                >
                  <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => onUnblock(row.ip_address)}
                  disabled={busyIp === row.ip_address}
                  className="btn-console gap-1.5 hover:border-signal-ok/50 hover:text-signal-ok"
                >
                  <ShieldOff className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                  {busyIp === row.ip_address ? "…" : "Unblock"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
