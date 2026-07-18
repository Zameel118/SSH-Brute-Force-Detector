/** Signal-Ops status badges + formatting helpers */

const STATUS_STYLES = {
  allowed: "border-signal-ok/40 text-signal-ok bg-signal-ok/10",
  alert: "border-signal-alert/40 text-signal-alert bg-signal-alert/10",
  rate_limited: "border-signal-alert/40 text-signal-alert bg-signal-alert/10",
  blocked: "border-signal-danger/40 text-signal-danger bg-signal-danger/10",
  unblocked: "border-chalk-muted/40 text-chalk-muted bg-transparent",
};

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.allowed;
  const label = (status || "unknown").replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 border text-2xs font-mono font-medium uppercase tracking-wider ${style}`}
    >
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

export function formatAction(action) {
  if (!action || action === "none") return "—";
  return action.replace(/_/g, " ");
}

/** True if event timestamp is within the last `ms` milliseconds */
export function isRecent(iso, ms = 8000) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ms;
}
