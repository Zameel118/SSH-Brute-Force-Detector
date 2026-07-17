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
  backgroundColor: "#1a2332",
  border: "1px solid #2a3544",
  borderRadius: 8,
  fontSize: 12,
};

export default function StatsCharts({ stats }) {
  const overTime = stats?.attacks_over_time || [];
  const topIps = stats?.top_attacking_ips || [];

  // Shorten hour labels for readability: show HH:00 only
  const lineData = overTime.map((p) => ({
    ...p,
    label: p.time.slice(-5),
  }));

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-surface-raised border border-surface-border rounded-xl p-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 mb-4">
          Attacks Over Time (24h)
        </h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid stroke="#2a3544" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                name="Events"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-surface-raised border border-surface-border rounded-xl p-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 mb-4">
          Top Attacking IPs
        </h2>
        <div className="h-56">
          {topIps.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              No attack data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topIps} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="#2a3544" strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="ip"
                  width={110}
                  tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#f04444" name="Failed attempts" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
