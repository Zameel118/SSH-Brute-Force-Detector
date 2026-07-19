import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  FolderOpen,
  MapPin,
  Share2,
} from "lucide-react";
import { api } from "../api";
import SessionReplayScrubber from "./SessionReplayScrubber";
import {
  StatusBadge,
  formatDuration,
  formatLocation,
  formatTime,
} from "./StatusBadge";

/**
 * Read-only shareable Case File page — /case/:publicId
 */
export default function CaseFilePage({ publicId, theme = "dark" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.getCase(publicId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load case file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  const snapshot = data?.snapshot || {};
  const geo = snapshot.geo || {};
  const summary = snapshot.summary || {};
  const steps = snapshot.escalation_steps || [];
  const loc = useMemo(
    () => formatLocation(geo.country_code, geo.label || geo.city, geo.label),
    [geo]
  );

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen bg-ink text-chalk">
      <header className="border-b border-ink-line bg-ink-panel/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="console-shell py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <FolderOpen className="w-5 h-5 text-phosphor shrink-0" strokeWidth={1.75} aria-hidden />
            <div className="min-w-0">
              <div className="text-2xs uppercase tracking-[0.16em] text-chalk-muted font-sans">
                Case File · read-only snapshot
              </div>
              <h1 className="font-mono text-lg text-phosphor truncate">
                {data?.title || snapshot.title || "Loading…"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={copyShare} className="btn-console gap-1.5" disabled={!data}>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-signal-ok" strokeWidth={1.75} />
              ) : (
                <Share2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              )}
              {copied ? "Copied" : "Copy link"}
            </button>
            <a href="/" className="btn-console gap-1.5 no-underline">
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
              Console
            </a>
          </div>
        </div>
      </header>

      <main className="console-shell py-6">
        {loading && (
          <p className="text-sm text-chalk-muted font-mono py-16 text-center">Loading case file…</p>
        )}
        {error && (
          <div className="border border-signal-danger/50 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger font-mono">
            {error}
          </div>
        )}

        {data && (
          <>
            <section className="panel mb-5 overflow-hidden">
              <div className="panel-header">
                <h2 className="panel-title">Subject</h2>
                <span className="font-mono text-2xs text-chalk-muted">{data.public_id}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0">
                <div className="px-4 py-4 border-b md:border-b-0 md:border-r border-ink-line">
                  <div className="text-2xs uppercase tracking-widest text-chalk-muted">Source IP</div>
                  <div className="font-mono text-xl text-phosphor mt-1 break-all">{data.source_ip}</div>
                </div>
                <div className="px-4 py-4 border-b md:border-b-0 lg:border-r border-ink-line">
                  <div className="text-2xs uppercase tracking-widest text-chalk-muted flex items-center gap-1">
                    <MapPin className="w-3 h-3" strokeWidth={1.75} />
                    Geo
                  </div>
                  <div className="font-mono text-sm mt-1">
                    {loc.code ? <span className="text-steel font-semibold">{loc.code} · </span> : null}
                    <span className="text-chalk">{loc.text}</span>
                  </div>
                  {geo.org ? (
                    <div className="text-2xs text-chalk-muted font-mono mt-1 truncate">{geo.org}</div>
                  ) : null}
                </div>
                <div className="px-4 py-4 border-b lg:border-b-0 lg:border-r border-ink-line">
                  <div className="text-2xs uppercase tracking-widest text-chalk-muted">Peak stage</div>
                  <div className="mt-2">
                    <StatusBadge status={summary.peak_stage || "watching"} />
                  </div>
                </div>
                <div className="px-4 py-4">
                  <div className="text-2xs uppercase tracking-widest text-chalk-muted">Block window</div>
                  <div className="font-mono text-lg text-chalk mt-1 tabular-nums">
                    {summary.blocked_duration_seconds != null
                      ? formatDuration(summary.blocked_duration_seconds)
                      : "—"}
                  </div>
                  <div className="text-2xs text-chalk-muted font-mono mt-1">
                    {summary.blocked_at ? `from ${formatTime(summary.blocked_at)}` : "No block record"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-ink-line">
                {[
                  { label: "Events", value: summary.event_count ?? "—" },
                  { label: "Max hits", value: summary.attempt_count_max ?? "—" },
                  { label: "First seen", value: formatTime(summary.first_seen) },
                  { label: "Last seen", value: formatTime(summary.last_seen) },
                ].map((s) => (
                  <div key={s.label} className="px-4 py-3 border-r border-ink-line last:border-r-0">
                    <div className="text-2xs uppercase tracking-widest text-chalk-muted">{s.label}</div>
                    <div className="font-mono text-sm text-chalk mt-1 truncate">{s.value}</div>
                  </div>
                ))}
              </div>
              {summary.usernames?.length > 0 && (
                <div className="px-4 py-3 border-t border-ink-line font-mono text-2xs text-chalk-muted">
                  Targets:{" "}
                  <span className="text-chalk">{summary.usernames.join(", ")}</span>
                </div>
              )}
            </section>

            <section className="panel mb-5">
              <div className="panel-header">
                <h2 className="panel-title">Escalation steps</h2>
                <span className="font-mono text-2xs text-chalk-muted">{steps.length} stages</span>
              </div>
              {steps.length === 0 ? (
                <p className="px-4 py-6 text-sm text-chalk-muted text-center">
                  No escalation markers in this snapshot
                </p>
              ) : (
                <ol className="divide-y divide-ink-line">
                  {steps.map((step, i) => (
                    <li key={`${step.stage}-${step.at}-${i}`} className="px-4 py-3 flex flex-wrap gap-3 items-center">
                      <span className="font-mono text-2xs text-chalk-faint w-6">{String(i + 1).padStart(2, "0")}</span>
                      <StatusBadge status={step.stage} />
                      <span className="font-mono text-2xs text-chalk-muted">{formatTime(step.at)}</span>
                      <span className="font-mono text-2xs text-chalk ml-auto tabular-nums">
                        hits {step.attempt_count}
                      </span>
                      {step.action_taken ? (
                        <span className="w-full sm:w-auto font-mono text-2xs text-chalk-muted sm:ml-0">
                          {step.action_taken}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <SessionReplayScrubber
              timeline={snapshot.timeline || []}
              title="Session replay scrubber"
              autoPlay={false}
            />

            <p className="mt-6 text-2xs text-chalk-muted font-mono text-center">
              Frozen {formatTime(snapshot.frozen_at || data.created_at)} · shareable without live feed
            </p>
          </>
        )}
      </main>
    </div>
  );
}

/** Modal to create / open replay for an IP from the live console. */
export function CaseReplayModal({
  open,
  ip,
  mode = "replay", // replay | created
  caseMeta = null,
  onClose,
  onCreateCase,
  creating = false,
}) {
  const [timeline, setTimeline] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !ip) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setTimeline(null);
      try {
        if (mode === "created" && caseMeta?.public_id) {
          const res = await api.getCase(caseMeta.public_id);
          if (!cancelled) setTimeline(res.snapshot);
        } else {
          const res = await api.getTimeline(ip);
          if (!cancelled) setTimeline(res);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load timeline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ip, mode, caseMeta?.public_id]);

  if (!open) return null;

  const sharePath = caseMeta?.share_path || (caseMeta?.public_id ? `/case/${caseMeta.public_id}` : "");
  const shareUrl = sharePath ? `${window.location.origin}${sharePath}` : "";

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-ink/80 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-ink-line bg-ink-panel shadow-2xl">
        <div className="panel-header sticky top-0 bg-ink-panel z-10">
          <h2 className="panel-title flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 text-phosphor" strokeWidth={1.75} />
            {mode === "created" ? "Case File ready" : "Replay"} ·{" "}
            <span className="text-phosphor font-mono normal-case tracking-normal">{ip}</span>
          </h2>
          <button type="button" className="btn-console !px-2" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          {mode === "created" && shareUrl && (
            <div className="flex flex-wrap gap-2 items-center border border-phosphor/30 bg-phosphor/5 px-3 py-3">
              <Copy className="w-3.5 h-3.5 text-phosphor shrink-0" strokeWidth={1.75} />
              <code className="font-mono text-xs text-phosphor flex-1 min-w-0 truncate">{shareUrl}</code>
              <button type="button" className="btn-console gap-1.5" onClick={copyLink}>
                {copied ? "Copied" : "Copy"}
              </button>
              <a href={sharePath} target="_blank" rel="noreferrer" className="btn-console btn-console-primary no-underline">
                Open
              </a>
            </div>
          )}

          {mode === "replay" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-console btn-console-primary gap-1.5"
                disabled={creating || loading}
                onClick={() => onCreateCase?.(ip)}
              >
                <Share2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                {creating ? "Freezing…" : "Create shareable Case File"}
              </button>
            </div>
          )}

          {loading && <p className="text-sm text-chalk-muted font-mono py-8 text-center">Loading timeline…</p>}
          {error && (
            <div className="border border-signal-danger/40 bg-signal-danger/10 px-3 py-2 text-sm text-signal-danger font-mono">
              {error}
            </div>
          )}
          {timeline && (
            <SessionReplayScrubber
              timeline={timeline.timeline || []}
              title="Session replay scrubber"
              compact
              autoPlay
            />
          )}
        </div>
      </div>
    </div>
  );
}
