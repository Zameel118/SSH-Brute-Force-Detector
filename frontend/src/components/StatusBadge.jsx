/** Signal-Ops status badges + formatting helpers */

const STATUS_META = {
  allowed: {
    emoji: "✅",
    label: "allowed",
    className: "bg-signal-ok/20 text-signal-ok",
  },
  alert: {
    emoji: "⚠️",
    label: "alert",
    className: "bg-signal-alert/20 text-signal-alert",
  },
  rate_limited: {
    emoji: "⏳",
    label: "rate limited",
    className: "bg-signal-alert/20 text-signal-alert",
  },
  blocked: {
    emoji: "🚫",
    label: "blocked",
    className: "bg-signal-danger/20 text-signal-danger",
  },
  watching: {
    emoji: "👁",
    label: "watching",
    className: "bg-steel/20 text-steel",
  },
  unblocked: {
    emoji: "🔓",
    label: "unblocked",
    className: "bg-chalk-muted/15 text-chalk-muted",
  },
};

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    emoji: "•",
    label: (status || "unknown").replace(/_/g, " "),
    className: "bg-chalk-muted/15 text-chalk-muted",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-2xs font-mono font-medium uppercase tracking-wider whitespace-nowrap ${meta.className}`}
    >
      <span className="text-[0.8em] leading-none" aria-hidden>
        {meta.emoji}
      </span>
      {meta.label}
    </span>
  );
}

/** Regional indicator flag from ISO country code (e.g. BR → 🇧🇷). */
export function flagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const cc = countryCode.toUpperCase();
  if (cc === "XX" || cc === "LAN") return "🏠";
  const A = 0x1f1e6;
  return String.fromCodePoint(...[...cc].map((c) => A + c.charCodeAt(0) - 65));
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

/** Compact clock for dense feed columns (avoids horizontal overflow). */
export function formatTimeShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Relative "2m ago" / "1h ago" for last-seen columns. */
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

/** True if event timestamp is within the last `ms` milliseconds */
export function isRecent(iso, ms = 8000) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ms;
}
