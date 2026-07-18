import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "#14171C",
  border: "1px solid #2A3038",
  borderRadius: 0,
  fontSize: 11,
  fontFamily: '"IBM Plex Mono", monospace',
  color: "#C8CDD4",
};

const tick = { fill: "#6E7681", fontSize: 10, fontFamily: '"IBM Plex Mono", monospace' };

export default function StatsCharts({ stats }) {
  const overTime = stats?.attacks_over_time || [];
  const topIps = stats?.top_attacking_ips || [];

  const lineData = overTime.map((p) => ({
    ...p,
    label: p.time.slice(-5),
  }));

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-0 border border-ink-line">
      <div className="panel border-0 border-b lg:border-b-0 lg:border-r border-ink-line rounded-none shadow-none">
        <div className="panel-header">
          <h2 className="panel-title">Attacks Over Time — 24h</h2>
        </div>
        <div className="h-56 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid stroke="#2A3038" strokeDasharray="2 4" />
              <XAxis dataKey="label" tick={tick} interval="preserveStartEnd" axisLine={{ stroke: "#2A3038" }} />
              <YAxis allowDecimals={false} tick={tick} axisLine={{ stroke: "#2A3038" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#FFB300"
                strokeWidth={1.5}
                dot={false}
                name="Events"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel border-0 rounded-none shadow-none">
        <div className="panel-header">
          <h2 className="panel-title">Top Attacking IPs</h2>
        </div>
        <div className="h-56 p-3">
          {topIps.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-chalk-muted">
              No attack data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topIps} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="#2A3038" strokeDasharray="2 4" />
                <XAxis type="number" allowDecimals={false} tick={tick} axisLine={{ stroke: "#2A3038" }} />
                <YAxis
                  type="category"
                  dataKey="ip"
                  width={110}
                  tick={{ ...tick, fill: "#5B7C99" }}
                  axisLine={{ stroke: "#2A3038" }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#E5484D" name="Failed attempts" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
