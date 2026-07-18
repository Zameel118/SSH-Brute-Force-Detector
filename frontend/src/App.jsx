import { useCallback, useEffect, useRef, useState } from "react";
import {
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
import StatsCharts from "./components/StatsCharts";

const MAX_EVENTS = 150;
const THEME_KEY = "ssh_detector_theme";

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
  const wsRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

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

  const isLive = config?.mode === "live";
  const wsLive = wsStatus === "connected";

  return (
    <div className="min-h-screen bg-scope-grid">
      {/* Console header bar */}
      <header className="sticky top-0 z-20 border-b border-ink-line bg-ink-panel/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Radio className="w-4 h-4 text-phosphor shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="text-2xs font-sans font-semibold uppercase tracking-[0.18em] text-chalk-muted">
                  Signal-Ops Console
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-sans font-bold tracking-tight text-chalk truncate">
                SSH Brute Force Detector
              </h1>
              <p className="text-2xs font-mono text-chalk-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>AUTH LOG MONITOR</span>
                <span className="text-chalk-faint">/</span>
                <span className={wsLive ? "text-phosphor" : "text-signal-alert"}>
                  WS {wsStatus.toUpperCase()}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
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

              {/* Mode switch — sharp instrument toggle */}
              <div className="flex items-stretch border border-ink-line bg-ink-edge">
                <button
                  type="button"
                  onClick={() => {
                    if (isLive) handleModeToggle();
                  }}
                  className={`px-3 py-2 text-2xs font-sans font-semibold uppercase tracking-wider ${
                    !isLive
                      ? "bg-phosphor text-ink"
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
                  className={`px-3 py-2 text-2xs font-sans font-semibold uppercase tracking-wider border-l border-ink-line ${
                    isLive
                      ? "bg-signal-danger text-chalk"
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
                onClick={handleSimulate}
                disabled={simulating}
                className="btn-console btn-console-primary gap-1.5"
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

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-5 space-y-0">
        {error && (
          <div className="mb-4 border border-signal-danger/50 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger font-mono">
            {error}
          </div>
        )}

        {/* Stat strip — hairline grid, not soft cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border border-ink-line mb-4">
          {[
            { label: "Events", value: stats?.total_events ?? "—", color: "text-chalk" },
            { label: "Alerts", value: stats?.total_alerts ?? "—", color: "text-signal-alert" },
            { label: "Blocks", value: stats?.total_blocks ?? "—", color: "text-signal-danger" },
            { label: "Active", value: stats?.active_blocks ?? "—", color: "text-phosphor" },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`bg-ink-panel px-4 py-3 ${
                i > 0 ? "border-l border-ink-line" : ""
              } ${i >= 2 ? "border-t sm:border-t-0 border-ink-line" : ""}`}
            >
              <div className="text-2xs uppercase tracking-[0.14em] text-chalk-muted font-sans">
                {s.label}
              </div>
              <div className={`text-2xl font-semibold mt-1 font-mono tabular-nums ${s.color}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {config && (
          <p className="text-2xs text-chalk-muted font-mono mb-4 leading-relaxed">
            WATCH {config.log_path}
            <span className="text-chalk-faint"> · </span>
            THR alert/{config.alert_threshold} → rate/{config.rate_limit_threshold} → block/
            {config.block_threshold}
            <span className="text-chalk-faint"> · </span>
            WIN {config.time_window_minutes}m
          </p>
        )}

        {/* Export / replay toolbar */}
        <div className="flex flex-wrap gap-2 items-center mb-4 pb-4 border-b border-ink-line">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-2">
            <EventFeed events={events} geoMap={geoMap} />
          </div>
          <BlockedPanel blocked={blocked} onUnblock={handleUnblock} busyIp={busyIp} />
        </div>

        <div className="mb-4">
          <AttackMap attackers={attackers} />
        </div>

        <div className="mb-4">
          <StatsCharts stats={stats} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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
    </div>
  );
}
