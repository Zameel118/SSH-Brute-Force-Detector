import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatusBadge, flagEmoji, formatRelative, formatTime } from "./StatusBadge";

/**
 * Attacks-over-time line + dense Top Attacking IPs table.
 */
export default function StatsCharts({ stats, theme = "dark", onCopyIp, geoMap = {} }) {
  const overTime = stats?.attacks_over_time || [];
  const topIps = stats?.top_attacking_ips || [];
  const isLight = theme === "light";
  const [, setTick] = useState(0);

  // Refresh relative "last seen" labels every 15s
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const lineStroke = isLight ? "#1B3A4B" : "#FFB300";
  const gridStroke = isLight ? "#CFD8E3" : "#2A3038";
  const tickFill = isLight ? "#64748B" : "#6E7681";
  const tooltipBg = isLight ? "#FFFFFF" : "#14171C";
  const tooltipBorder = isLight ? "#CFD8E3" : "#2A3038";
  const tooltipColor = isLight ? "#1E293B" : "#C8CDD4";

  const tooltipStyle = {
    backgroundColor: tooltipBg,
    border: `1px solid ${tooltipBorder}`,
    borderRadius: 0,
    fontSize: 11,
    fontFamily: '"IBM Plex Mono", monospace',
    color: tooltipColor,
  };

  const axisTick = { fill: tickFill, fontSize: 10, fontFamily: '"IBM Plex Mono", monospace' };

  const lineData = overTime.map((p) => ({
    ...p,
    label: p.time.slice(-5),
  }));

  const ranked = topIps.slice(0, 12);
  const liveSources = ranked.some((r) => r.status === "blocked" || r.status === "rate_limited");

  return (
    <section className="border border-ink-line">
      <div className="panel border-0 border-b border-ink-line rounded-none shadow-none">
        <div className="panel-header">
          <h2 className="panel-title">Attacks Over Time — 24h</h2>
          <span className="flex items-center gap-1.5 text-2xs font-mono uppercase tracking-widest text-chalk-muted">
            <span className="live-dot live-dot-on !w-1.5 !h-1.5" aria-hidden />
            Streaming
          </span>
        </div>
        <div className="h-52 md:h-56 p-4 relative">
          <div className="chart-live-glow pointer-events-none" aria-hidden />
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="2 4" />
              <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" axisLine={{ stroke: gridStroke }} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={{ stroke: gridStroke }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="count"
                stroke={lineStroke}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: lineStroke }}
                name="Events"
                isAnimationActive
                animationDuration={700}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`panel border-0 rounded-none shadow-none ${liveSources ? "panel-live-hot" : ""}`}>
        <div className="panel-header">
          <h2 className="panel-title">Top Attacking IPs</h2>
          <span className="font-mono text-2xs text-chalk-muted tabular-nums flex items-center gap-2">
            {ranked.length} sources
            {liveSources && <span className="live-dot live-dot-on !w-1.5 !h-1.5" aria-hidden />}
          </span>
        </div>
        <div className="overflow-hidden">
          {ranked.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-chalk-muted">
              No attack data yet — run Simulate
            </div>
          ) : (
            <div className="feed-scroll max-h-[18rem]">
              <table className="feed-table w-full text-sm">
                <thead className="sticky top-0 bg-ink-edge text-left text-2xs uppercase tracking-widest text-chalk-muted border-b border-ink-line">
                  <tr>
                    <th className="px-2.5 py-1.5 font-sans font-medium w-9">#</th>
                    <th className="px-2.5 py-1.5 font-sans font-medium">Source IP</th>
                    <th className="px-2.5 py-1.5 font-sans font-medium hidden sm:table-cell">Location</th>
                    <th className="px-2.5 py-1.5 font-sans font-medium hidden md:table-cell">Target</th>
                    <th className="px-2.5 py-1.5 font-sans font-medium text-right w-14">Hits</th>
                    <th className="px-2.5 py-1.5 font-sans font-medium hidden lg:table-cell w-[5.5rem]">
                      Last seen
                    </th>
                    <th className="px-2.5 py-1.5 font-sans font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((row, i) => {
                    const geo = geoMap[row.ip];
                    const code = row.country_code || geo?.country_code || "";
                    const locLabel =
                      row.location ||
                      geo?.label ||
                      (code ? `${code}` : "—");
                    const last = row.last_seen;
                    return (
                      <tr
                        key={row.ip}
                        className="border-b border-ink-line/50 hover:bg-phosphor/5 group"
                      >
                        <td className="px-2.5 py-1 font-mono text-2xs text-chalk-faint tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td className="px-2.5 py-1 font-mono text-xs text-phosphor">
                          <button
                            type="button"
                            onClick={() => onCopyIp?.(row.ip)}
                            className="inline-flex items-center gap-1 hover:underline focus-visible:underline max-w-full"
                            title="Copy IP"
                          >
                            <span className="truncate">{row.ip}</span>
                            <Copy
                              className="w-3 h-3 opacity-40 group-hover:opacity-70 shrink-0"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </button>
                        </td>
                        <td
                          className="px-2.5 py-1 text-xs text-steel font-mono hidden sm:table-cell truncate"
                          title={locLabel}
                        >
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <span aria-hidden>{flagEmoji(code)}</span>
                            <span className="truncate">{locLabel}</span>
                          </span>
                        </td>
                        <td className="px-2.5 py-1 font-mono text-xs text-chalk-muted hidden md:table-cell truncate">
                          {row.top_user || "—"}
                        </td>
                        <td className="px-2.5 py-1 font-mono text-xs text-chalk tabular-nums text-right font-semibold">
                          {row.count}
                        </td>
                        <td
                          className="px-2.5 py-1 font-mono text-2xs text-chalk-muted tabular-nums hidden lg:table-cell whitespace-nowrap"
                          title={formatTime(last)}
                        >
                          {formatRelative(last)}
                        </td>
                        <td className="px-2.5 py-1">
                          <StatusBadge status={row.status || "watching"} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
