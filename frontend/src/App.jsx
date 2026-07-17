import { useCallback, useEffect, useRef, useState } from "react";
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

  return (
    <div className="min-h-screen bg-grid transition-colors">
      <header className="border-b border-surface-border/80 bg-surface/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white light:text-slate-900">
                SSH Brute Force Detector
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Log monitoring · Escalating response ·{" "}
                <span className={wsStatus === "connected" ? "text-accent-green" : "text-accent-yellow"}>
                  WS {wsStatus}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="px-3 py-2 text-xs rounded-lg border border-surface-border bg-surface-raised hover:bg-slate-700/50 transition-colors"
                title="Toggle theme"
              >
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              <button
                onClick={() => setShowAuth((v) => !v)}
                className="px-3 py-2 text-xs rounded-lg border border-surface-border bg-surface-raised hover:bg-slate-700/50 transition-colors"
              >
                API Key
              </button>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-border bg-surface-raised">
                <span className={`text-xs font-medium ${!isLive ? "text-accent-cyan" : "text-slate-500"}`}>
                  Simulation
                </span>
                <button
                  onClick={handleModeToggle}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    isLive ? "bg-accent-red/80" : "bg-slate-600"
                  }`}
                  aria-label="Toggle mode"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      isLive ? "translate-x-5" : ""
                    }`}
                  />
                </button>
                <span className={`text-xs font-medium ${isLive ? "text-accent-red" : "text-slate-500"}`}>
                  Live
                </span>
              </div>

              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-surface-border
                           hover:border-accent-orange/50 hover:text-accent-orange disabled:opacity-60 transition-colors"
              >
                {resetting ? "Resetting…" : "Reset Demo"}
              </button>

              <button
                onClick={handleSimulate}
                disabled={simulating}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent-cyan text-surface
                           hover:bg-sky-400 disabled:opacity-60 transition-colors shadow-lg shadow-sky-500/10"
              >
                {simulating ? "Simulating…" : "Simulate Attack"}
              </button>
            </div>
          </div>

          {showAuth && (
            <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg border border-surface-border bg-surface-raised">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="X-API-Key (optional — leave empty if auth disabled)"
                className="flex-1 min-w-[200px] bg-surface border border-surface-border rounded-md px-3 py-2 text-sm font-mono outline-none"
              />
              <button
                onClick={saveApiKey}
                className="px-3 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Events", value: stats?.total_events ?? "—", color: "text-slate-200" },
            { label: "Alerts", value: stats?.total_alerts ?? "—", color: "text-accent-yellow" },
            { label: "Blocks", value: stats?.total_blocks ?? "—", color: "text-accent-red" },
            { label: "Active Blocks", value: stats?.active_blocks ?? "—", color: "text-accent-orange" },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-surface-raised border border-surface-border rounded-xl px-4 py-3"
            >
              <div className="text-xs uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className={`text-2xl font-semibold mt-1 font-mono ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {config && (
          <p className="text-xs text-slate-500 font-mono">
            Watching: {config.log_path} · thresholds alert/{config.alert_threshold} →
            rate/{config.rate_limit_threshold} → block/{config.block_threshold} per{" "}
            {config.time_window_minutes}m
          </p>
        )}

        {/* Export + sample replay toolbar */}
        <div className="flex flex-wrap gap-2 items-center">
          <a
            href={api.exportCsvUrl()}
            className="px-3 py-1.5 text-xs rounded-md border border-surface-border hover:border-accent-cyan/40 hover:text-accent-cyan transition-colors"
          >
            Export CSV
          </a>
          <a
            href={api.exportReportUrl()}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-xs rounded-md border border-surface-border hover:border-accent-cyan/40 hover:text-accent-cyan transition-colors"
          >
            Incident Report (PDF)
          </a>
          <a
            href={api.fail2banUrl()}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-xs rounded-md border border-surface-border hover:border-accent-green/40 hover:text-accent-green transition-colors"
          >
            Export fail2ban config
          </a>
          <span className="text-xs text-slate-500 ml-1">Replay sample:</span>
          {samples.map((s) => (
            <button
              key={s.name}
              onClick={() => handleReplay(s.name)}
              disabled={!!replaying}
              title={s.description}
              className="px-3 py-1.5 text-xs rounded-md border border-surface-border font-mono
                         hover:border-accent-orange/40 hover:text-accent-orange disabled:opacity-50 transition-colors"
            >
              {replaying === s.name ? "…" : s.name.replace(".log", "")}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <EventFeed events={events} geoMap={geoMap} />
          </div>
          <BlockedPanel blocked={blocked} onUnblock={handleUnblock} busyIp={busyIp} />
        </div>

        <AttackMap attackers={attackers} />

        <StatsCharts stats={stats} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IPListManager
            title="Whitelist (never block)"
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
            title="Blacklist (block on sight)"
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
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg bg-surface-raised border border-surface-border
                        text-sm text-slate-200 shadow-xl max-w-sm"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
