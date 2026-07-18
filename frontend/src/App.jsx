import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleHelp,
  Download,
  FileText,
  KeyRound,
  Moon,
  Radio,
  RotateCcw,
  Sun,
  Zap,
} from "lucide-react";
import { api, getWsUrl } from "./api";
import AttackMap from "./components/AttackMap";
import BlockedPanel from "./components/BlockedPanel";
import EventFeed from "./components/EventFeed";
import IPListManager from "./components/IPListManager";
import LiveActivityBar from "./components/LiveActivityBar";
import StatsCharts from "./components/StatsCharts";
import TourGuide, { shouldAutoShowTour } from "./components/TourGuide";

const MAX_EVENTS = 150;
const THEME_KEY = "ssh_detector_theme";
const SOUND_KEY = "ssh_detector_sound";

function playAlertTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 300);
  } catch {
    /* audio blocked */
  }
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [stats, setStats] = useState(null);
  const [attackers, setAttackers] = useState([]);
  const [geoMap, setGeoMap] = useState({});
  const [samples, setSamples] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [replaying, setReplaying] = useState("");
  const [busyIp, setBusyIp] = useState(null);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem("ssh_detector_api_key") || "");
  const [showAuth, setShowAuth] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) === "1");
  const [statFlash, setStatFlash] = useState(false);
  const wsRef = useRef(null);
  const simulateRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
  }, [soundOn]);

  useEffect(() => {
    if (shouldAutoShowTour()) {
      const t = setTimeout(() => setTourOpen(true), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const copyIp = useCallback(
    async (ip) => {
      if (!ip) return;
      try {
        await navigator.clipboard.writeText(ip);
        showToast(`Copied ${ip}`);
      } catch {
        showToast("Copy failed");
      }
    },
    []
  );

  const refreshGeo = useCallback(async () => {
    try {
      const geos = await api.getAttackersGeo();
      setAttackers(geos);
      const map = {};
      for (const g of geos) map[g.ip] = g;
      setGeoMap(map);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshLists = useCallback(async () => {
    try {
      const [b, w, bl, s] = await Promise.all([
        api.getBlocked(),
        api.getWhitelist(),
        api.getBlacklist(),
        api.getStats(),
      ]);
      setBlocked(b);
      setWhitelist(w);
      setBlacklist(bl);
      setStats(s);
      await refreshGeo();
    } catch (err) {
      console.error(err);
    }
  }, [refreshGeo]);

  const loadInitial = useCallback(async () => {
    try {
      setError("");
      const [cfg, ev, smp] = await Promise.all([
        api.getConfig(),
        api.getEvents(100),
        api.listSamples().catch(() => []),
      ]);
      setConfig(cfg);
      setEvents(ev);
      setSamples(smp);
      await refreshLists();
    } catch (err) {
      setError(
        err.message?.includes("API-Key")
          ? "API key required — open the key panel and save your key."
          : "Cannot reach backend API. Is the server running?"
      );
      console.error(err);
    }
  }, [refreshLists]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    let closed = false;
    let retryTimer;

    function connect() {
      if (closed) return;
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => setWsStatus("connected");
      ws.onclose = () => {
        setWsStatus("disconnected");
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data);
          if (payload.type === "event" && payload.data) {
            setEvents((prev) => {
              if (prev.some((e) => e.id === payload.data.id)) return prev;
              return [payload.data, ...prev].slice(0, MAX_EVENTS);
            });
            setStatFlash(true);
            setTimeout(() => setStatFlash(false), 600);

            if (payload.data.event_type === "block" && localStorage.getItem(SOUND_KEY) === "1") {
              playAlertTone();
            }
            if (
              ["alert", "block", "rate_limit", "failed_password", "invalid_user", "unblock"].includes(
                payload.data.event_type
              )
            ) {
              refreshLists();
            }
          }
          if (payload.type === "blocked_updated" || payload.type === "demo_reset") {
            if (payload.type === "demo_reset") {
              setEvents([]);
            }
            refreshLists();
          }
        } catch {
          /* ignore */
        }
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [refreshLists]);

  async function handleSimulate() {
    setSimulating(true);
    try {
      const res = await api.simulateAttack({
        attacker_ip: "203.0.113.50",
        target_user: "root",
        num_attempts: 20,
        include_normal_traffic: true,
      });
      showToast(res.message);
    } catch (err) {
      showToast(err.message || "Simulation failed");
    } finally {
      setSimulating(false);
    }
  }

  simulateRef.current = handleSimulate;

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    const apply = () => setTheme(next);
    if (document.startViewTransition) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }

  async function handleReset() {
    if (!window.confirm("Reset demo? This clears events, blocks, and lists.")) return;
    setResetting(true);
    try {
      const res = await api.resetDemo();
      setEvents([]);
      await loadInitial();
      showToast(res.message);
    } catch (err) {
      showToast(err.message || "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function handleReplay(name) {
    setReplaying(name);
    try {
      const res = await api.replaySample(name);
      showToast(res.message);
    } catch (err) {
      showToast(err.message || "Replay failed");
    } finally {
      setReplaying("");
    }
  }

  async function handleModeToggle() {
    if (!config) return;
    const next = config.mode === "simulation" ? "live" : "simulation";
    if (next === "live") {
      const ok = window.confirm(
        "Switch to LIVE mode?\n\nThis will watch the real auth log and can run real ufw block commands."
      );
      if (!ok) return;
    }
    try {
      const updated = await api.setMode(next);
      setConfig(updated);
      showToast(`Mode set to ${updated.mode}`);
    } catch (err) {
      showToast(err.message || "Mode switch failed");
    }
  }

  async function handleUnblock(ip) {
    setBusyIp(ip);
    try {
      await api.unblock(ip);
      showToast(`Unblocked ${ip}`);
      await refreshLists();
    } catch (err) {
      showToast(err.message || "Unblock failed");
    } finally {
      setBusyIp(null);
    }
  }

  function saveApiKey() {
    localStorage.setItem("ssh_detector_api_key", apiKeyInput.trim());
    setShowAuth(false);
    showToast(apiKeyInput.trim() ? "API key saved" : "API key cleared");
    loadInitial();
  }

  // Keyboard shortcuts: ? help, S simulate, C copy latest IP
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setTourOpen(true);
      }
      if (e.key === "s" || e.key === "S") {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          simulateRef.current?.();
        }
      }
      if (e.key === "c" || e.key === "C") {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const ip = events[0]?.source_ip;
          if (ip) copyIp(ip);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [events, copyIp]);

  const isLive = config?.mode === "live";
  const wsLive = wsStatus === "connected";

  return (
    <div className="min-h-screen bg-scope-grid">
      <header className="sticky top-0 z-20 border-b border-ink-line bg-ink-panel/95 backdrop-blur-sm">
        <div className="console-shell py-4 flex flex-col gap-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="min-w-0" data-tour="brand">
              <div className="flex items-center gap-2 mb-1">
                <Radio className="w-4 h-4 text-phosphor shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="text-2xs font-sans font-semibold uppercase tracking-[0.18em] text-chalk-muted">
                  Signal-Ops Console
                </span>
                <span className={`live-dot ${wsLive ? "live-dot-on" : "live-dot-off"}`} title={`WS ${wsStatus}`} />
              </div>
              <h1 className="text-xl sm:text-2xl font-sans font-bold tracking-tight text-chalk truncate">
                SSH Brute Force Detector
              </h1>
              <p className="text-2xs font-mono text-chalk-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>AUTH LOG MONITOR</span>
                <span className="text-chalk-faint">/</span>
                <span className={wsLive ? "text-phosphor" : "text-signal-alert"}>
                  WS {wsStatus.toUpperCase()}
                </span>
                <span className="text-chalk-faint hidden md:inline">·</span>
                <span className="text-chalk-faint hidden md:inline normal-case tracking-normal">
                  ? help · S simulate · C copy IP
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-tour="help"
                onClick={() => setTourOpen(true)}
                className="btn-console gap-1.5"
                title="Open guide (?)"
                aria-label="Open tour guide"
              >
                <CircleHelp className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                Help
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                className="btn-console"
                title="Toggle theme"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="w-3.5 h-3.5" strokeWidth={1.75} />
                ) : (
                  <Moon className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowAuth((v) => !v)}
                className="btn-console gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                Key
              </button>

              <div data-tour="mode" className="flex items-stretch border border-ink-line bg-ink-edge">
                <button
                  type="button"
                  onClick={() => {
                    if (isLive) handleModeToggle();
                  }}
                  className={`px-3.5 py-2 text-2xs font-sans font-semibold uppercase tracking-wider ${
                    !isLive
                      ? "bg-phosphor text-phosphor-on"
                      : "text-chalk-muted hover:text-chalk"
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isLive) handleModeToggle();
                  }}
                  className={`px-3.5 py-2 text-2xs font-sans font-semibold uppercase tracking-wider border-l border-ink-line ${
                    isLive
                      ? "bg-signal-danger text-white"
                      : "text-chalk-muted hover:text-chalk"
                  }`}
                >
                  Live
                </button>
              </div>

              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="btn-console gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                {resetting ? "…" : "Reset"}
              </button>

              <button
                type="button"
                data-tour="simulate"
                onClick={handleSimulate}
                disabled={simulating}
                className={`btn-console btn-console-primary gap-1.5 ${simulating ? "animate-pulse" : ""}`}
              >
                <Zap className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                {simulating ? "Injecting…" : "Simulate"}
              </button>
            </div>
          </div>

          {showAuth && (
            <div className="flex flex-wrap gap-2 items-center p-3 border border-ink-line bg-ink-edge">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="X-API-Key (optional)"
                className="flex-1 min-w-[200px] bg-ink border border-ink-line px-3 py-2 text-sm font-mono text-chalk
                           outline-none focus:border-phosphor placeholder:text-chalk-faint"
              />
              <button type="button" onClick={saveApiKey} className="btn-console">
                Save
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="console-shell py-6">
        {error && (
          <div className="mb-5 border border-signal-danger/50 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger font-mono">
            {error}
          </div>
        )}

        <LiveActivityBar
          events={events}
          wsStatus={wsStatus}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((v) => !v)}
          onCopyIp={copyIp}
        />

        <div
          data-tour="stats"
          className={`grid grid-cols-2 lg:grid-cols-4 border border-ink-line mb-5 transition-shadow ${
            statFlash ? "live-hot" : ""
          }`}
        >
          {[
            { label: "Events", value: stats?.total_events ?? "—", color: "text-chalk" },
            { label: "Alerts", value: stats?.total_alerts ?? "—", color: "text-signal-alert" },
            { label: "Blocks", value: stats?.total_blocks ?? "—", color: "text-signal-danger" },
            { label: "Active", value: stats?.active_blocks ?? "—", color: "text-phosphor" },
          ].map((s, i) => (
            <div
              key={s.label}
              className={[
                "bg-ink-panel px-5 py-4",
                i % 2 === 1 ? "border-l border-ink-line" : "",
                i >= 2 ? "border-t border-ink-line" : "",
                i > 0 ? "lg:border-l lg:border-ink-line" : "",
                i >= 2 ? "lg:border-t-0" : "",
              ].join(" ")}
            >
              <div className="text-2xs uppercase tracking-[0.14em] text-chalk-muted font-sans">
                {s.label}
              </div>
              <div className={`text-3xl font-semibold mt-1.5 font-mono tabular-nums stat-value ${s.color} ${statFlash ? "is-flash" : ""}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {config && (
          <p className="text-xs text-chalk-muted font-mono mb-4 leading-relaxed">
            WATCH {config.log_path}
            <span className="text-chalk-faint"> · </span>
            THR alert/{config.alert_threshold} → rate/{config.rate_limit_threshold} → block/
            {config.block_threshold}
            <span className="text-chalk-faint"> · </span>
            WIN {config.time_window_minutes}m
          </p>
        )}

        <div
          data-tour="toolbar"
          className="flex flex-wrap gap-2 items-center mb-5 pb-5 border-b border-ink-line"
        >
          <a href={api.exportCsvUrl()} className="btn-console gap-1.5 no-underline">
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
            CSV
          </a>
          <a
            href={api.exportReportUrl()}
            target="_blank"
            rel="noreferrer"
            className="btn-console gap-1.5 no-underline"
          >
            <FileText className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
            Report
          </a>
          <a
            href={api.fail2banUrl()}
            target="_blank"
            rel="noreferrer"
            className="btn-console gap-1.5 no-underline"
          >
            fail2ban
          </a>
          <span className="text-2xs text-chalk-muted uppercase tracking-wider ml-1 hidden sm:inline">
            Replay
          </span>
          {samples.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => handleReplay(s.name)}
              disabled={!!replaying}
              title={s.description}
              className="btn-console font-mono normal-case tracking-normal"
            >
              {replaying === s.name ? "…" : s.name.replace(".log", "").replace("ssh_", "")}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
          <div className="xl:col-span-2 min-w-0" data-tour="feed">
            <EventFeed events={events} geoMap={geoMap} onCopyIp={copyIp} />
          </div>
          <div data-tour="blocked">
            <BlockedPanel
              blocked={blocked}
              onUnblock={handleUnblock}
              busyIp={busyIp}
              onCopyIp={copyIp}
            />
          </div>
        </div>

        <div className="mb-5" data-tour="map">
          <AttackMap attackers={attackers} theme={theme} />
        </div>

        <div className="mb-5">
          <StatsCharts stats={stats} theme={theme} onCopyIp={copyIp} geoMap={geoMap} />
        </div>

        <div data-tour="lists" className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10">
          <IPListManager
            title="Whitelist — never block"
            items={whitelist}
            accent="green"
            onAdd={async (ip, reason) => {
              await api.addWhitelist(ip, reason);
              setWhitelist(await api.getWhitelist());
            }}
            onRemove={async (ip) => {
              await api.removeWhitelist(ip);
              setWhitelist(await api.getWhitelist());
            }}
          />
          <IPListManager
            title="Blacklist — block on sight"
            items={blacklist}
            accent="red"
            onAdd={async (ip, reason) => {
              await api.addBlacklist(ip, reason);
              setBlacklist(await api.getBlacklist());
            }}
            onRemove={async (ip) => {
              await api.removeBlacklist(ip);
              setBlacklist(await api.getBlacklist());
            }}
          />
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 border border-phosphor/40 bg-ink-panel text-sm font-mono text-phosphor max-w-sm">
          {toast}
        </div>
      )}

      <TourGuide
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        onAction={async (action) => {
          if (action.type === "simulate") {
            await handleSimulate();
          }
        }}
      />
    </div>
  );
}
