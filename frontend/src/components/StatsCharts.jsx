import { useEffect, useMemo, useState } from "react";
import { Activity, Copy, Crosshair, FolderOpen, Play, Shield } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  StatusBadge,
  formatDuration,
  formatLocation,
  formatRelative,
  formatTime,
} from "./StatusBadge";

const CONTAINMENT_COLORS = {
  blocked: "#ff5a5f",
  rate_limited: "#6eb6ff",
  watching: "#9ec0d8",
};

/**
 * Dual charts + polished Top Attacking IPs table.
 */
export default function StatsCharts({
  stats,
  theme = "dark",
  onCopyIp,
  geoMap = {},
  onReplayIp,
  onCreateCase,
  caseBusyIp,
}) {
  const overTime = stats?.attacks_over_time || [];
  const topIps = stats?.top_attacking_ips || [];
  const isLight = theme === "light";
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const lineStroke = isLight ? "#1B3A4B" : "#FFB300";
  const gridStroke = isLight ? "#CFD8E3" : "#2A3038";
  const tickFill = isLight ? "#64748B" : "#A8B0BA";
  const tooltipBg = isLight ? "#FFFFFF" : "#1E2329";
  const tooltipBorder = isLight ? "#CFD8E3" : "#3A424C";
  const tooltipColor = isLight ? "#1E293B" : "#F0F3F6";

  const tooltipStyle = {
    backgroundColor: tooltipBg,
    border: `1px solid ${tooltipBorder}`,
    borderRadius: 0,
    fontSize: 11,
    fontFamily: '"IBM Plex Mono", monospace',
    color: tooltipColor,
  };
  const tooltipItemStyle = { color: tooltipColor };
  const tooltipLabelStyle = { color: isLight ? "#64748B" : "#C8CDD4" };

  const axisTick = { fill: tickFill, fontSize: 10, fontFamily: '"IBM Plex Mono", monospace' };

  const lineData = overTime.map((p) => ({
    ...p,
    label: p.time.slice(-5),
  }));

  const ranked = topIps.slice(0, 12);
  const maxHits = Math.max(1, ...ranked.map((r) => r.count || 0));
  const maxTtl = Math.max(1, ...ranked.map((r) => r.ttl_seconds || 0));
  const liveSources = ranked.some((r) => r.status === "blocked" || r.status === "rate_limited");

  const containment = useMemo(() => {
    const buckets = { blocked: 0, rate_limited: 0, watching: 0 };
    for (const row of ranked) {
      const key = buckets[row.status] != null ? row.status : "watching";
      buckets[key] += row.count || 0;
    }
    return [
      { key: "blocked", name: "Blocked", value: buckets.blocked, color: CONTAINMENT_COLORS.blocked },
      {
        key: "rate_limited",
        name: "Rate limited",
        value: buckets.rate_limited,
        color: CONTAINMENT_COLORS.rate_limited,
      },
      { key: "watching", name: "Watching", value: buckets.watching, color: CONTAINMENT_COLORS.watching },
    ].filter((d) => d.value > 0);
  }, [ranked]);

  const containmentTotal = containment.reduce((s, d) => s + d.value, 0);

  return (
    <section className="border border-ink-line">
      <div className="chart-pair border-b border-ink-line">
        <div className="panel border-0 border-b lg:border-b-0 lg:border-r border-ink-line rounded-none shadow-none">
          <div className="panel-header">
            <h2 className="panel-title flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-phosphor" strokeWidth={1.75} aria-hidden />
              Attacks Over Time — 24h
            </h2>
            <span className="flex items-center gap-1.5 text-2xs font-mono uppercase tracking-widest text-chalk-muted">
              <span className="live-dot live-dot-on !w-1.5 !h-1.5" aria-hidden />
              Streaming
            </span>
          </div>
          <div className="h-64 md:h-72 p-3 relative">
            <div className="chart-live-glow pointer-events-none" aria-hidden />
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineData}>
                <defs>
                  <linearGradient id="attackAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineStroke} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={lineStroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} strokeDasharray="2 4" />
                <XAxis
                  dataKey="label"
                  tick={axisTick}
                  interval="preserveStartEnd"
                  axisLine={{ stroke: gridStroke }}
                  minTickGap={28}
                />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={{ stroke: gridStroke }} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={lineStroke}
                  strokeWidth={2}
                  fill="url(#attackAreaFill)"
                  name="Events"
                  isAnimationActive
                  animationDuration={700}
                  activeDot={{ r: 3, fill: lineStroke, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel border-0 rounded-none shadow-none">
          <div className="panel-header">
            <h2 className="panel-title flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-signal-danger" strokeWidth={1.75} aria-hidden />
              Containment Mix
            </h2>
            <span className="font-mono text-2xs text-chalk-muted tabular-nums">by hit volume</span>
          </div>
          <div className="h-56 md:h-64 px-2 pt-3 containment-ring-host">
            {containmentTotal === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-chalk-muted">
                No containment data yet
              </div>
            ) : (
              <>
                <div className="containment-ring-center">
                  <span className="containment-ring-center__value">{containmentTotal}</span>
                  <span className="containment-ring-center__label">hits scored</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      itemStyle={tooltipItemStyle}
                      labelStyle={tooltipLabelStyle}
                      formatter={(value, name) => [`${value} hits`, name]}
                    />
                    <Pie
                      data={containment}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="58%"
                      outerRadius="82%"
                      paddingAngle={2}
                      stroke={isLight ? "#ffffff" : "#14171C"}
                      strokeWidth={2}
                      isAnimationActive
                      animationDuration={800}
                    >
                      {containment.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.color}
                          style={{ filter: `drop-shadow(0 0 6px ${entry.color}99)` }}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
          {containmentTotal > 0 && (
            <div className="containment-legend">
              {containment.map((d) => (
                <span key={d.key} className="containment-legend__item">
                  <span
                    className="containment-legend__swatch"
                    style={{
                      background: d.color,
                      boxShadow: `0 0 8px ${d.color}`,
                    }}
                    aria-hidden
                  />
                  {d.name}
                  <span className="containment-legend__count tabular-nums">{d.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel border-0 rounded-none shadow-none">
        <div className="panel-header">
          <h2 className="panel-title flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5 text-phosphor" strokeWidth={1.75} aria-hidden />
            Top Attacking IPs
          </h2>
          <span className="font-mono text-2xs text-chalk-muted tabular-nums flex items-center gap-2">
            {ranked.length} sources
            {liveSources && <span className="live-dot live-dot-on !w-1.5 !h-1.5" aria-hidden />}
          </span>
        </div>

        {ranked.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-chalk-muted">
            No attack data yet — run Simulate
          </div>
        ) : (
          <div className="feed-scroll max-h-[22rem] overflow-x-auto">
            <table className="feed-table top-ip-table w-full min-w-[1000px]">
              <thead className="sticky top-0 z-[1] bg-ink-edge text-left text-2xs uppercase tracking-widest text-chalk-muted border-b border-ink-line">
                <tr>
                  <th className="px-3 py-2.5 font-sans font-medium w-12">#</th>
                  <th className="px-3 py-2.5 font-sans font-medium">Source IP</th>
                  <th className="px-3 py-2.5 font-sans font-medium hidden sm:table-cell">Location</th>
                  <th className="px-3 py-2.5 font-sans font-medium hidden md:table-cell">Target</th>
                  <th className="px-3 py-2.5 font-sans font-medium">Hits</th>
                  <th className="px-3 py-2.5 font-sans font-medium">Share</th>
                  <th className="px-3 py-2.5 font-sans font-medium">Threat</th>
                  <th className="px-3 py-2.5 font-sans font-medium">TTL</th>
                  <th className="px-3 py-2.5 font-sans font-medium hidden xl:table-cell">Last seen</th>
                  <th className="px-3 py-2.5 font-sans font-medium">Status</th>
                  <th className="px-3 py-2.5 font-sans font-medium">Case</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, i) => {
                  const geo = geoMap[row.ip];
                  const code = row.country_code || geo?.country_code || "";
                  const loc = formatLocation(code, row.location, geo?.label);
                  const last = row.last_seen;
                  const hitPct = Math.max(6, Math.round(((row.count || 0) / maxHits) * 100));
                  const share = row.share ?? 0;
                  const threat = row.threat ?? 0;
                  const ttl = row.ttl_seconds;
                  const ttlPct =
                    ttl != null && ttl > 0 ? Math.max(4, Math.round((ttl / maxTtl) * 100)) : 0;
                  const isLead = i === 0;
                  const threatHigh = threat >= 75;
                  const ttlCritical = ttl != null && ttl > 0 && ttl < 3600;
                  const busy = caseBusyIp === row.ip;

                  return (
                    <tr key={row.ip} className="top-ip-row border-b border-ink-line/60 group">
                      <td className="px-3 py-2.5">
                        <span className={`top-ip-rank ${isLead ? "top-ip-rank--lead" : ""}`}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-sm text-phosphor">
                        <button
                          type="button"
                          onClick={() => onCopyIp?.(row.ip)}
                          className="inline-flex items-center gap-1.5 hover:underline focus-visible:underline max-w-full"
                          title="Copy IP"
                        >
                          <span className="truncate font-semibold tracking-tight">{row.ip}</span>
                          <Copy
                            className="w-3 h-3 opacity-40 group-hover:opacity-80 shrink-0"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell" title={loc.text}>
                        <div className="font-mono text-xs leading-tight">
                          {loc.code ? (
                            <span className="text-steel font-semibold">{loc.code}</span>
                          ) : null}
                          <div className="text-chalk-muted truncate text-2xs mt-0.5">{loc.text}</div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-chalk hidden md:table-cell truncate">
                        {row.top_user || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-sm text-chalk font-semibold tabular-nums leading-none">
                          {row.count}
                        </div>
                        <div className="top-ip-hits-bar" aria-hidden>
                          <div className="top-ip-hits-fill" style={{ width: `${hitPct}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="top-ip-metric">
                          <span className="top-ip-metric__value text-phosphor">{share.toFixed(1)}%</span>
                          <div className="top-ip-share-track" aria-hidden>
                            <div
                              className="top-ip-share-fill"
                              style={{ width: `${Math.max(4, share)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="top-ip-metric">
                          <span
                            className={`top-ip-metric__value ${
                              threatHigh ? "text-signal-danger" : "text-signal-alert"
                            }`}
                          >
                            {threat}
                          </span>
                          <div className="top-ip-threat-track" aria-hidden>
                            <div
                              className={`top-ip-threat-fill ${threatHigh ? "top-ip-threat-fill--high" : ""}`}
                              style={{ width: `${Math.max(6, threat)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {ttl != null && ttl > 0 ? (
                          <div className="top-ip-metric">
                            <span
                              className={`top-ip-metric__value ${
                                ttlCritical ? "text-signal-danger" : "text-steel"
                              }`}
                            >
                              {formatDuration(ttl)}
                            </span>
                            <div className="top-ip-ttl-track" aria-hidden>
                              <div
                                className={`top-ip-ttl-fill ${ttlCritical ? "top-ip-ttl-fill--critical" : ""}`}
                                style={{ width: `${ttlPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono text-2xs text-chalk-faint">—</span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2.5 font-mono text-2xs text-chalk-muted tabular-nums hidden xl:table-cell whitespace-nowrap"
                        title={formatTime(last)}
                      >
                        {formatRelative(last)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={row.status || "watching"} compact />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="btn-console !px-2 !py-1"
                            title="Replay session"
                            onClick={() => onReplayIp?.(row.ip)}
                          >
                            <Play className="w-3 h-3" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            className="btn-console !px-2 !py-1"
                            title="Create Case File"
                            disabled={busy}
                            onClick={() => onCreateCase?.(row.ip)}
                          >
                            <FolderOpen className="w-3 h-3" strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
