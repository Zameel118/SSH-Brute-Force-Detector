import { Activity } from "lucide-react";
import { StatusBadge, formatAction, formatTime, isRecent } from "./StatusBadge";

/**
 * Live attack feed with signature phosphor radar sweep.
 * Props unchanged: { events, geoMap }
 */
export default function EventFeed({ events, geoMap = {} }) {
  return (
    <section className="panel overflow-hidden h-full">
      <div className="panel-header">
        <h2 className="panel-title flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-phosphor" strokeWidth={1.75} aria-hidden />
          Live Attack Feed
        </h2>
        <span className="flex items-center gap-1.5 text-2xs font-mono uppercase tracking-widest text-phosphor">
          <span className="w-1.5 h-1.5 bg-phosphor" aria-hidden />
          Signal live
        </span>
      </div>

      <div className="feed-sweep-host overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm relative z-[1]">
          <thead className="sticky top-0 bg-ink-edge text-left text-2xs uppercase tracking-widest text-chalk-muted border-b border-ink-line">
            <tr>
              <th className="px-3 py-2 font-sans font-medium">Time</th>
              <th className="px-3 py-2 font-sans font-medium">Source IP</th>
              <th className="px-3 py-2 font-sans font-medium">Location</th>
              <th className="px-3 py-2 font-sans font-medium">User</th>
              <th className="px-3 py-2 font-sans font-medium">Type</th>
              <th className="px-3 py-2 font-sans font-medium">Status</th>
              <th className="px-3 py-2 font-sans font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-chalk-muted">
                  No signal — press{" "}
                  <span className="text-phosphor font-mono text-xs">SIMULATE</span> to inject traffic
                </td>
              </tr>
            )}
            {events.map((ev) => {
              const geo = geoMap[ev.source_ip];
              const recent = isRecent(ev.timestamp);
              return (
                <tr
                  key={ev.id}
                  className={`border-b border-ink-line/60 hover:bg-phosphor/5 ${
                    recent ? "animate-row-pulse" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-chalk-muted whitespace-nowrap font-mono text-xs">
                    {formatTime(ev.timestamp)}
                  </td>
                  <td className="px-3 py-2 font-mono text-phosphor text-xs">{ev.source_ip}</td>
                  <td className="px-3 py-2 text-xs text-steel whitespace-nowrap font-mono">
                    {geo?.label || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-chalk">{ev.username || "—"}</td>
                  <td className="px-3 py-2 text-xs text-chalk-muted font-mono">{ev.event_type}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={ev.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-chalk-muted font-mono">
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
