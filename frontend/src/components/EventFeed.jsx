import { useMemo, useState, useEffect } from "react";
import { Activity, Copy, Radio } from "lucide-react";
import {
  StatusBadge,
  formatAction,
  formatEventType,
  formatTime,
  formatTimeShort,
  isRecent,
} from "./StatusBadge";

/**
 * Live attack feed — stream rail + row ingress (no yellow center wash).
 */
export default function EventFeed({ events, geoMap = {}, onCopyIp }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const rate = useMemo(() => {
    const cutoff = now - 60_000;
    return events.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    }).length;
  }, [events, now]);

  const hot = events.some((ev) => isRecent(ev.timestamp, 12000));
  const meterPct = Math.min(100, Math.round((rate / 24) * 100));

  return (
    <section className={`panel overflow-hidden h-full feed-panel ${hot ? "feed-panel--hot" : ""}`}>
      <div className="panel-header">
        <h2 className="panel-title flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-phosphor" strokeWidth={1.75} aria-hidden />
          Live Attack Feed
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xs text-chalk-muted tabular-nums hidden sm:inline">
            {rate}/min
          </span>
          <span className="flex items-center gap-1.5 text-2xs font-mono uppercase tracking-widest text-phosphor">
            <span className="live-dot live-dot-on" aria-hidden />
            <Radio className="w-3 h-3 animate-signal-pulse" strokeWidth={1.75} aria-hidden />
            Signal live
          </span>
        </div>
      </div>

      <div className="feed-stream-rail" aria-hidden>
        <div className="feed-stream-rail__scan" />
        <div className="feed-stream-rail__meter" style={{ width: `${meterPct}%` }} />
      </div>

      <div className="feed-scroll max-h-[min(520px,55vh)]">
        <table className="feed-table w-full text-sm">
          <colgroup>
            <col className="w-[7rem]" />
            <col className="w-[9rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[5rem]" />
            <col className="w-[10.5rem]" />
            <col className="w-[8.5rem]" />
            <col />
          </colgroup>
          <thead className="sticky top-0 bg-ink-edge text-left text-2xs uppercase tracking-widest text-chalk-muted border-b border-ink-line z-[1]">
            <tr>
              <th className="px-3 py-2.5 font-sans font-medium">Time</th>
              <th className="px-3 py-2.5 font-sans font-medium">Source IP</th>
              <th className="px-3 py-2.5 font-sans font-medium hidden sm:table-cell">Location</th>
              <th className="px-3 py-2.5 font-sans font-medium">User</th>
              <th className="px-3 py-2.5 font-sans font-medium hidden md:table-cell">Type</th>
              <th className="px-3 py-2.5 font-sans font-medium">Status</th>
              <th className="px-3 py-2.5 font-sans font-medium hidden lg:table-cell">Action</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-chalk-muted">
                  No signal — press{" "}
                  <span className="text-phosphor font-mono text-xs">SIMULATE</span> or{" "}
                  <span className="text-phosphor font-mono text-xs">S</span> to inject traffic
                </td>
              </tr>
            )}
            {events.map((ev) => {
              const geo = geoMap[ev.source_ip];
              const recent = isRecent(ev.timestamp);
              const loc =
                geo?.label?.replace(/^([A-Z]{2})\s*-\s*/, "$1 · ") ||
                geo?.country_code ||
                "—";
              return (
                <tr
                  key={ev.id}
                  className={`feed-row border-b border-ink-line/60 hover:bg-phosphor/[0.04] ${
                    recent ? "feed-row--ingress" : ""
                  }`}
                >
                  <td
                    className="px-3 py-2 text-chalk-muted whitespace-nowrap font-mono text-xs tabular-nums"
                    title={formatTime(ev.timestamp)}
                  >
                    {formatTimeShort(ev.timestamp)}
                  </td>
                  <td className="px-3 py-2 font-mono text-phosphor text-xs">
                    <button
                      type="button"
                      onClick={() => onCopyIp?.(ev.source_ip)}
                      className="inline-flex items-center gap-1 max-w-full hover:underline focus-visible:underline"
                      title="Copy IP"
                    >
                      <span className="truncate">{ev.source_ip}</span>
                      <Copy className="w-3 h-3 opacity-50 shrink-0" strokeWidth={1.75} aria-hidden />
                    </button>
                  </td>
                  <td
                    className="px-3 py-2 text-xs text-steel whitespace-nowrap font-mono hidden sm:table-cell truncate"
                    title={geo?.label || undefined}
                  >
                    {loc}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-chalk truncate">{ev.username || "—"}</td>
                  <td
                    className="px-3 py-2 text-xs text-chalk-muted font-mono hidden md:table-cell feed-cell-type"
                    title={ev.event_type}
                  >
                    {formatEventType(ev.event_type)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={ev.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-chalk-muted font-mono hidden lg:table-cell truncate">
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
