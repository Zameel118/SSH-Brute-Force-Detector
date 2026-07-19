import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  StatusBadge,
  formatEventType,
  formatTime,
  formatTimeShort,
} from "./StatusBadge";

const STAGE_ORDER = ["alert", "rate_limited", "blocked", "unblocked"];

function stageAtIndex(timeline, index) {
  let stage = "watching";
  const slice = timeline.slice(0, Math.max(0, index) + 1);
  for (const ev of slice) {
    const et = (ev.event_type || "").toLowerCase();
    const st = (ev.status || "").toLowerCase();
    if (et === "alert" || st === "alert") stage = "alert";
    else if (et === "rate_limit" || st === "rate_limited") stage = "rate_limited";
    else if (et === "block" || st === "blocked") stage = "blocked";
    else if (et === "unblock" || st === "unblocked") stage = "unblocked";
  }
  return stage;
}

/**
 * Scrubber UI — replay an attack timeline by sliding through stored events.
 */
export default function SessionReplayScrubber({
  timeline = [],
  title = "Session replay",
  autoPlay = false,
  compact = false,
}) {
  const events = useMemo(
    () => [...timeline].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (ta !== tb) return ta - tb;
      return (a.id || 0) - (b.id || 0);
    }),
    [timeline]
  );

  const max = Math.max(0, events.length - 1);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef(null);

  useEffect(() => {
    setIndex(0);
    setPlaying(autoPlay && events.length > 1);
  }, [events, autoPlay]);

  useEffect(() => {
    if (!playing || events.length < 2) return undefined;
    const ms = Math.max(120, 650 / speed);
    timerRef.current = setInterval(() => {
      setIndex((i) => {
        if (i >= max) {
          setPlaying(false);
          return max;
        }
        return i + 1;
      });
    }, ms);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, max, events.length]);

  const visible = events.slice(0, index + 1);
  const current = events[index] || null;
  const stage = stageAtIndex(events, index);
  const progress = max === 0 ? 100 : Math.round((index / max) * 100);

  const jump = useCallback(
    (n) => setIndex(Math.max(0, Math.min(max, n))),
    [max]
  );

  if (events.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{title}</h2>
        </div>
        <p className="px-4 py-8 text-sm text-chalk-muted text-center">No timeline events</p>
      </div>
    );
  }

  return (
    <section className="panel overflow-hidden replay-scrubber">
      <div className="panel-header">
        <h2 className="panel-title">{title}</h2>
        <span className="font-mono text-2xs text-chalk-muted tabular-nums">
          {index + 1}/{events.length}
        </span>
      </div>

      <div className="px-4 pt-4 pb-3 border-b border-ink-line space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge status={stage} />
            <span className="font-mono text-2xs text-chalk-muted truncate">
              {current ? formatTime(current.timestamp) : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`btn-console !px-2 !py-1 ${
                  speed === s ? "border-phosphor text-phosphor" : ""
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="replay-stage-rail" aria-hidden>
          {STAGE_ORDER.map((s) => {
            const reached = STAGE_ORDER.indexOf(s) <= STAGE_ORDER.indexOf(stage);
            const active = s === stage;
            return (
              <div
                key={s}
                className={`replay-stage-rail__step ${reached ? "is-reached" : ""} ${
                  active ? "is-active" : ""
                }`}
              >
                <span className="replay-stage-rail__dot" />
                <span className="replay-stage-rail__label">{s.replace(/_/g, " ")}</span>
              </div>
            );
          })}
        </div>

        <input
          type="range"
          min={0}
          max={max}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            jump(Number(e.target.value));
          }}
          className="replay-range"
          aria-label="Scrub attack timeline"
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-console !px-2"
              onClick={() => {
                setPlaying(false);
                jump(0);
              }}
              title="Start"
            >
              <SkipBack className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="btn-console !px-2"
              onClick={() => {
                setPlaying(false);
                jump(index - 1);
              }}
              title="Previous"
            >
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="btn-console btn-console-primary !px-3 gap-1.5"
              onClick={() => {
                if (index >= max) jump(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? (
                <Pause className="w-3.5 h-3.5" strokeWidth={1.75} />
              ) : (
                <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
              )}
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className="btn-console !px-2"
              onClick={() => {
                setPlaying(false);
                jump(index + 1);
              }}
              title="Next"
            >
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="btn-console !px-2"
              onClick={() => {
                setPlaying(false);
                jump(max);
              }}
              title="End"
            >
              <SkipForward className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
          <span className="font-mono text-2xs text-phosphor tabular-nums">{progress}%</span>
        </div>
      </div>

      <div className={`feed-scroll ${compact ? "max-h-56" : "max-h-80"} overflow-y-auto`}>
        <table className="feed-table w-full">
          <thead className="sticky top-0 z-[1] bg-ink-edge text-left text-2xs uppercase tracking-widest text-chalk-muted border-b border-ink-line">
            <tr>
              <th className="px-3 py-2 font-sans font-medium">Time</th>
              <th className="px-3 py-2 font-sans font-medium">Type</th>
              <th className="px-3 py-2 font-sans font-medium hidden sm:table-cell">User</th>
              <th className="px-3 py-2 font-sans font-medium">Status</th>
              <th className="px-3 py-2 font-sans font-medium hidden md:table-cell">Hits</th>
            </tr>
          </thead>
          <tbody>
            {[...visible].reverse().map((ev, i) => {
              const isCurrent = i === 0;
              return (
                <tr
                  key={`${ev.id}-${ev.timestamp}-${i}`}
                  className={`border-b border-ink-line/60 ${isCurrent ? "replay-row-current" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-2xs text-chalk-muted whitespace-nowrap">
                    {formatTimeShort(ev.timestamp)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-chalk">
                    {formatEventType(ev.event_type)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-chalk-muted hidden sm:table-cell">
                    {ev.username || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={ev.status || "allowed"} compact />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-chalk tabular-nums hidden md:table-cell">
                    {ev.attempt_count || 0}
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
