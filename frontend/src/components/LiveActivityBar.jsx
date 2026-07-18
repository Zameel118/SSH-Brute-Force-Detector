import { useEffect, useMemo, useState } from "react";
import { Activity, Copy, Radio, Volume2, VolumeX } from "lucide-react";
import { formatTime, isRecent } from "./StatusBadge";

/**
 * Live activity strip — rate, heartbeat, ticker, sound toggle.
 */
export default function LiveActivityBar({
  events,
  wsStatus,
  soundOn,
  onToggleSound,
  onCopyIp,
}) {
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

  const last = events[0];
  const lastAge = last
    ? Math.max(0, Math.floor((now - new Date(last.timestamp).getTime()) / 1000))
    : null;

  const ticker = events.slice(0, 8);
  const hot = rate >= 5;
  const wsLive = wsStatus === "connected";

  return (
    <div
      data-tour="livebar"
      className={`mb-5 border border-ink-line bg-ink-panel overflow-hidden ${
        hot ? "live-hot" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-ink-line bg-ink-edge/50">
        <div className="flex items-center gap-2">
          <span className={`live-dot ${wsLive ? "live-dot-on" : "live-dot-off"}`} aria-hidden />
          <span className="text-2xs font-mono uppercase tracking-widest text-chalk-muted">
            Link {wsLive ? "UP" : "DOWN"}
          </span>
        </div>

        <div className="h-4 w-px bg-ink-line hidden sm:block" aria-hidden />

        <div className="flex items-center gap-2 font-mono text-xs">
          <Activity className={`w-3.5 h-3.5 ${hot ? "text-signal-danger animate-pulse" : "text-phosphor"}`} strokeWidth={1.75} />
          <span className="text-chalk-muted uppercase text-2xs tracking-wider">Rate</span>
          <span className={`tabular-nums font-semibold ${hot ? "text-signal-danger" : "text-phosphor"}`}>
            {rate}
          </span>
          <span className="text-chalk-faint text-2xs">evt/min</span>
        </div>

        <div className="h-4 w-px bg-ink-line hidden sm:block" aria-hidden />

        <div className="flex items-center gap-2 font-mono text-xs text-chalk-muted">
          <Radio className="w-3.5 h-3.5 text-steel" strokeWidth={1.75} />
          <span className="text-2xs uppercase tracking-wider">Last</span>
          <span className="tabular-nums text-chalk">
            {lastAge == null ? "—" : lastAge < 5 ? "now" : `${lastAge}s ago`}
          </span>
        </div>

        <div className="flex-1" />

        {last?.source_ip && (
          <button
            type="button"
            onClick={() => onCopyIp?.(last.source_ip)}
            className="btn-console gap-1.5 !py-1.5 !text-2xs"
            title="Copy latest attacker IP (C)"
          >
            <Copy className="w-3 h-3" strokeWidth={1.75} aria-hidden />
            <span className="font-mono normal-case tracking-normal">{last.source_ip}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleSound}
          className="btn-console !py-1.5"
          title={soundOn ? "Mute block alerts" : "Enable block alert tone"}
          aria-pressed={soundOn}
        >
          {soundOn ? (
            <Volume2 className="w-3.5 h-3.5 text-phosphor" strokeWidth={1.75} />
          ) : (
            <VolumeX className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {/* Scrolling event ticker */}
      <div className="relative h-9 overflow-hidden bg-ink">
        <div className="ticker-track absolute flex items-center gap-6 whitespace-nowrap px-4">
          {ticker.length === 0 ? (
            <span className="text-2xs font-mono text-chalk-faint uppercase tracking-wider py-2">
              Awaiting signal…
            </span>
          ) : (
            [...ticker, ...ticker].map((ev, i) => (
              <span
                key={`${ev.id}-${i}`}
                className={`inline-flex items-center gap-2 text-2xs font-mono py-2 ${
                  isRecent(ev.timestamp, 12000) ? "text-phosphor" : "text-chalk-muted"
                }`}
              >
                <span className="text-chalk-faint">{formatTime(ev.timestamp)}</span>
                <span className="text-phosphor">{ev.source_ip}</span>
                <span>{ev.username || "—"}</span>
                <span className="uppercase text-chalk-faint">{ev.status}</span>
                <span className="text-ink-line">|</span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
