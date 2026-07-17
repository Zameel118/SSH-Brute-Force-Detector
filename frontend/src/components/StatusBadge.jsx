/** Color / label helpers for status badges */
const STATUS_STYLES = {
  allowed: "bg-accent-green/15 text-accent-green border-accent-green/30",
  alert: "bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30",
  rate_limited: "bg-accent-orange/15 text-accent-orange border-accent-orange/30",
  blocked: "bg-accent-red/15 text-accent-red border-accent-red/30",
  unblocked: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.allowed;
  const label = (status || "unknown").replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium capitalize ${style}`}>
      {label}
    </span>
  );
}

export function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(seconds) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Format action_taken for display */
export function formatAction(action) {
  if (!action || action === "none") return "—";
  return action.replace(/_/g, " ");
}
