import { ShieldBan, ShieldOff } from "lucide-react";
import { formatDuration, formatTime } from "./StatusBadge";

export default function BlockedPanel({ blocked, onUnblock, busyIp }) {
  return (
    <section className="panel overflow-hidden h-full flex flex-col">
      <div className="panel-header">
        <h2 className="panel-title flex items-center gap-2">
          <ShieldBan className="w-3.5 h-3.5 text-signal-danger" strokeWidth={1.75} aria-hidden />
          Blocked / Rate-Limited
        </h2>
        <span className="font-mono text-2xs text-chalk-muted tabular-nums">{blocked.length}</span>
      </div>

      <div className="p-0 max-h-[360px] overflow-y-auto flex-1">
        {blocked.length === 0 && (
          <p className="text-sm text-chalk-muted px-3 py-8 text-center">No active containment</p>
        )}
        {blocked.map((row) => (
          <div
            key={row.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-3 border-b border-ink-line"
          >
            <div className="min-w-0">
              <div className="font-mono text-sm text-signal-danger">{row.ip_address}</div>
              <div className="text-2xs text-chalk-muted mt-1 font-mono">
                <span
                  className={
                    row.stage === "blocked" ? "text-signal-danger" : "text-signal-alert"
                  }
                >
                  {row.stage}
                </span>
                <span className="text-chalk-faint"> · </span>
                TTL {formatDuration(row.seconds_remaining)}
                <span className="text-chalk-faint"> · </span>
                since {formatTime(row.blocked_at)}
              </div>
            </div>
            <button
              onClick={() => onUnblock(row.ip_address)}
              disabled={busyIp === row.ip_address}
              className="btn-console shrink-0 gap-1.5 hover:border-signal-ok/50 hover:text-signal-ok"
            >
              <ShieldOff className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
              {busyIp === row.ip_address ? "…" : "Unblock"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
