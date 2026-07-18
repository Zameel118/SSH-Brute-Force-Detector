/** Minimal status marks — colored text + live signal pip. */

const STATUS_META = {
  allowed: { label: "Allowed", tone: "ok", live: false },
  alert: { label: "Alert", tone: "warn", live: true },
  rate_limited: { label: "Rate limited", tone: "blue", live: true },
  blocked: { label: "Blocked", tone: "danger", live: true },
  watching: { label: "Watching", tone: "steel", live: false },
  unblocked: { label: "Unblocked", tone: "muted", live: false },
};

export function StatusBadge({ status, compact = false }) {
  const meta = STATUS_META[status] || {
    label: (status || "Unknown").replace(/_/g, " "),
    tone: "muted",
    live: false,
  };
  const label =
    compact && status === "rate_limited" ? "Rate ltd" : meta.label;
  return (
    <span
      className={`status-mark status-mark--${meta.tone}${meta.live ? " status-mark--live" : ""}`}
      title={meta.label}
    >
      <span className="status-mark__pip" aria-hidden />
      {label}
    </span>
  );
}

/** Clean country label without duplicated country codes. */
export function formatLocation(code, location, fallbackLabel) {
  const cc = (code || "").toUpperCase();
  const raw = location || fallbackLabel || "";
  if (!raw && !cc) return { code: "", text: "—" };
  let text = raw
    .replace(/^[A-Z]{2}\s*[-·–—]\s*/i, "")
    .replace(new RegExp(`^${cc}\\s+`, "i"), "")
    .trim();
  if (!text || text.toUpperCase() === cc) text = raw || cc || "—";
  return { code: cc, text };
}

export function formatEventType(type) {
  if (!type) return "—";
  return String(type).replace(/_/g, " ");
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

export function formatTimeShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelative(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
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

export function isRecent(iso, ms = 8000) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ms;
}
