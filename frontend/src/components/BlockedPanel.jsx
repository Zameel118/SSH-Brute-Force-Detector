import { formatDuration, formatTime } from "./StatusBadge";

export default function BlockedPanel({ blocked, onUnblock, busyIp }) {
  return (
    <section className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-surface-border">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300">
          Blocked / Rate-Limited IPs
        </h2>
      </div>
      <div className="p-3 space-y-2 max-h-[360px] overflow-y-auto">
        {blocked.length === 0 && (
          <p className="text-sm text-slate-500 px-1 py-4 text-center">No IPs currently blocked</p>
        )}
        {blocked.map((row) => (
          <div
            key={row.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-surface border border-surface-border"
          >
            <div className="min-w-0">
              <div className="font-mono text-sm text-accent-red">{row.ip_address}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                <span
                  className={
                    row.stage === "blocked" ? "text-accent-red" : "text-accent-orange"
                  }
                >
                  {row.stage}
                </span>
                {" · "}
                expires in {formatDuration(row.seconds_remaining)}
                {" · "}
                since {formatTime(row.blocked_at)}
              </div>
            </div>
            <button
              onClick={() => onUnblock(row.ip_address)}
              disabled={busyIp === row.ip_address}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-surface-border
                         text-slate-300 hover:bg-accent-green/10 hover:text-accent-green hover:border-accent-green/40
                         disabled:opacity-50 transition-colors"
            >
              {busyIp === row.ip_address ? "Unblocking…" : "Unblock"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
