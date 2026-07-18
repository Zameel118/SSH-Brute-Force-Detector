import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

const TOUR_KEY = "ssh_detector_tour_seen";

const STEPS = [
  {
    id: "welcome",
    target: "brand",
    title: "Signal-Ops Console",
    body: "This tool tails SSH auth logs, detects brute-force spikes, and escalates response: alert → rate-limit → block. Follow the highlights — you can skip anytime.",
    placement: "bottom",
  },
  {
    id: "simulate",
    target: "simulate",
    title: "Inject a demo attack",
    body: "SIMULATE writes realistic failed-login lines into the fake auth log. The detector tails them live — no real SSH or firewall needed.",
    placement: "bottom",
    action: { label: "Run Simulate", type: "simulate" },
  },
  {
    id: "mode",
    target: "mode",
    title: "SIM vs LIVE",
    body: "SIM is safe for demos. LIVE watches a real auth.log and can run ufw — only on machines you control. Admin/localhost IPs are never blocked.",
    placement: "bottom",
  },
  {
    id: "stats",
    target: "stats",
    title: "Pulse meters",
    body: "These counters update as events stream in. Watch Alerts and Blocks climb when a simulated attack crosses thresholds.",
    placement: "bottom",
  },
  {
    id: "feed",
    target: "feed",
    title: "Live attack feed",
    body: "Every parsed login attempt lands here over WebSocket. Green = allowed, amber = alert/rate-limit, red = blocked. The sweep marks an active signal.",
    placement: "right",
  },
  {
    id: "blocked",
    target: "blocked",
    title: "Containment bay",
    body: "IPs that hit rate-limit or block appear here with TTL until auto-unblock. Unblock manually if a legit user gets caught.",
    placement: "left",
  },
  {
    id: "replay",
    target: "toolbar",
    title: "Exports & sample replay",
    body: "Pull CSV / incident reports for SOC-style evidence, export a fail2ban jail snippet, or replay shipped attack samples.",
    placement: "bottom",
  },
  {
    id: "map",
    target: "map",
    title: "Attack origins",
    body: "Geo pins mark where attacks appear to originate. Demo IPs resolve offline so the map stays useful even without the GeoIP API.",
    placement: "top",
  },
  {
    id: "lists",
    target: "lists",
    title: "Allow & deny lists",
    body: "Whitelist trusted networks so typos never trigger a block. Blacklist known-bad IPs for immediate containment.",
    placement: "top",
  },
  {
    id: "done",
    target: "help",
    title: "You are live",
    body: "Reopen this guide anytime with Help (or press ?). Tip: press S to simulate, C to copy the newest attacker IP.",
    placement: "bottom",
  },
];

const PAD = 10;

function getRect(selector) {
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
    bottom: r.bottom + PAD,
    right: r.right + PAD,
    el,
  };
}

function tooltipStyle(rect, placement, tipW, tipH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 16;

  if (!rect) {
    return { top: Math.max(24, (vh - tipH) / 2), left: Math.max(16, (vw - tipW) / 2) };
  }

  const tryPlace = (p) => {
    if (p === "bottom") {
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2 - tipW / 2 };
    }
    if (p === "top") {
      return { top: rect.top - tipH - gap, left: rect.left + rect.width / 2 - tipW / 2 };
    }
    if (p === "right") {
      return { top: rect.top + rect.height / 2 - tipH / 2, left: rect.right + gap };
    }
    if (p === "left") {
      return { top: rect.top + rect.height / 2 - tipH / 2, left: rect.left - tipW - gap };
    }
    return { top: rect.bottom + gap, left: rect.left };
  };

  let pos = tryPlace(placement);
  pos.left = Math.min(Math.max(12, pos.left), vw - tipW - 12);
  pos.top = Math.min(Math.max(12, pos.top), vh - tipH - 12);

  if (placement === "bottom" && rect.bottom + tipH + gap > vh - 8) {
    pos = tryPlace("top");
    pos.left = Math.min(Math.max(12, pos.left), vw - tipW - 12);
    pos.top = Math.min(Math.max(12, pos.top), vh - tipH - 12);
  }
  if (placement === "right" && rect.right + tipW + gap > vw - 8) {
    pos = tryPlace("left");
    pos.left = Math.min(Math.max(12, pos.left), vw - tipW - 12);
  }

  return pos;
}

export default function TourGuide({ open, onClose, onAction }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [tipReady, setTipReady] = useState(false);
  const [bodyKey, setBodyKey] = useState(0);
  const tipRef = useRef(null);
  const [tipSize, setTipSize] = useState({ w: 360, h: 200 });

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const measure = useCallback(() => {
    if (!open || !current) return;
    if (!current.target) {
      setRect(null);
      return;
    }
    const r = getRect(current.target);
    setRect(r);
    if (r?.el) {
      r.el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [open, current]);

  useLayoutEffect(() => {
    if (!open) {
      setTipReady(false);
      return undefined;
    }
    setStep(0);
    setTipReady(false);
    const t = requestAnimationFrame(() => setTipReady(true));
    return () => cancelAnimationFrame(t);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    setBodyKey((k) => k + 1);
    setTipReady(false);

    const t0 = requestAnimationFrame(() => {
      measure();
      // Allow layout + scroll to settle, then show tip
      const t1 = setTimeout(() => {
        if (tipRef.current) {
          const b = tipRef.current.getBoundingClientRect();
          setTipSize({ w: b.width, h: b.height });
        }
        setTipReady(true);
      }, 80);
      return () => clearTimeout(t1);
    });

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelAnimationFrame(t0);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  if (!open) return null;

  function finish() {
    localStorage.setItem(TOUR_KEY, "1");
    onClose();
  }

  function next() {
    if (isLast) finish();
    else setStep((s) => s + 1);
  }

  function prev() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function runAction() {
    if (!current.action || !onAction) return;
    await onAction(current.action);
  }

  const tipPos = tooltipStyle(rect, current.placement || "bottom", tipSize.w, tipSize.h);

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Product tour">
      <div className="tour-backdrop" onClick={finish} aria-hidden />
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          aria-hidden
        />
      )}

      <div
        ref={tipRef}
        className={`tour-tooltip panel ${tipReady ? "is-ready" : "is-entering"}`}
        style={{ top: tipPos.top, left: tipPos.left }}
      >
        <div className="panel-header !py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-2xs text-phosphor tabular-nums shrink-0">
              {String(step + 1).padStart(2, "0")}/{String(STEPS.length).padStart(2, "0")}
            </span>
            <h2
              key={`title-${bodyKey}`}
              className="tour-body-fade text-sm font-sans font-semibold text-chalk truncate tracking-normal normal-case"
            >
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={finish}
            className="p-1 text-chalk-muted hover:text-phosphor transition-colors"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-4 py-3">
          <p key={`body-${bodyKey}`} className="tour-body-fade text-sm leading-relaxed text-chalk">
            {current.body}
          </p>
          <div className="flex gap-1 mt-3" aria-hidden>
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`h-1 flex-1 transition-all duration-300 ${
                  i === step ? "bg-phosphor scale-y-150" : i < step ? "bg-phosphor/40" : "bg-ink-line"
                }`}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-ink-line bg-ink-edge/40">
          <button
            type="button"
            onClick={finish}
            className="text-2xs text-chalk-muted hover:text-chalk uppercase tracking-wider transition-colors"
          >
            Skip
          </button>
          <div className="flex flex-wrap gap-2">
            {current.action && (
              <button
                type="button"
                onClick={runAction}
                className="btn-console gap-1.5 border-phosphor/50 text-phosphor"
              >
                {current.action.label}
              </button>
            )}
            <button type="button" onClick={prev} disabled={step === 0} className="btn-console gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
              Back
            </button>
            <button type="button" onClick={next} className="btn-console btn-console-primary gap-1.5">
              {isLast ? "Finish" : "Next"}
              {!isLast && <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function shouldAutoShowTour() {
  try {
    return localStorage.getItem(TOUR_KEY) !== "1";
  } catch {
    return true;
  }
}
