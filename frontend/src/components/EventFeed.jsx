import { StatusBadge, formatAction, formatTime } from "./StatusBadge";

/**
 * Live attack feed — newest events at the top.
 * Shows GeoIP label when available in geoMap[ip].
 */
export default function EventFeed({ events, geoMap = {} }) {
  return (
    <section className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 dark:text-slate-300 text-slate-600">
          Live Attack Feed
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-accent-cyan">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
          Live
        </span>
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-raised text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Source IP</th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border/60">
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No events yet — click <strong className="text-slate-300">Simulate Attack</strong> to demo
                </td>
              </tr>
            )}
            {events.map((ev) => {
              const geo = geoMap[ev.source_ip];
              return (
                <tr key={ev.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap font-mono text-xs">
                    {formatTime(ev.timestamp)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-accent-cyan text-xs">{ev.source_ip}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                    {geo?.label || "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{ev.username || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{ev.event_type}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={ev.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">
                    {formatAction(ev.action_taken)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
