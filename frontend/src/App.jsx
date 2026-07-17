import { useCallback, useEffect, useRef, useState } from "react";
import { api, getWsUrl } from "./api";
import BlockedPanel from "./components/BlockedPanel";
import EventFeed from "./components/EventFeed";
import IPListManager from "./components/IPListManager";
import StatsCharts from "./components/StatsCharts";

const MAX_EVENTS = 150;

export default function App() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [stats, setStats] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [busyIp, setBusyIp] = useState(null);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const wsRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

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
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      setError("");
      const [cfg, ev] = await Promise.all([api.getConfig(), api.getEvents(100)]);
      setConfig(cfg);
      setEvents(ev);
      await refreshLists();
    } catch (err) {
      setError("Cannot reach backend API. Is the server running?");
      console.error(err);
    }
  }, [refreshLists]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // WebSocket for live updates
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
            // Refresh stats occasionally when attack-related events arrive
            if (["alert", "block", "rate_limit", "failed_password", "invalid_user", "unblock"].includes(payload.data.event_type)) {
              refreshLists();
            }
          }
          if (payload.type === "blocked_updated") {
            refreshLists();
          }
        } catch {
          /* ignore malformed */
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

  async function handleModeToggle() {
    if (!config) return;
    const next = config.mode === "simulation" ? "live" : "simulation";
    if (next === "live") {
      const ok = window.confirm(
        "Switch to LIVE mode?\n\nThis will watch the real auth log and can run real ufw block commands. Only use on a machine you control."
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

  const isLive = config?.mode === "live";

  return (
    <div className="min-h-screen bg-grid">
      {/* Header */}
      <header className="border-b border-surface-border/80 bg-surface/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              SSH Brute Force Detector
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Log monitoring · Escalating response ·{" "}
              <span className={wsStatus === "connected" ? "text-accent-green" : "text-accent-yellow"}>
                WS {wsStatus}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Mode toggle */}
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
              onClick={handleSimulate}
              disabled={simulating}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent-cyan text-surface
                         hover:bg-sky-400 disabled:opacity-60 transition-colors shadow-lg shadow-sky-500/10"
            >
              {simulating ? "Simulating…" : "Simulate Attack"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {error}
          </div>
        )}

        {/* Stat pills */}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <EventFeed events={events} />
          </div>
          <BlockedPanel blocked={blocked} onUnblock={handleUnblock} busyIp={busyIp} />
        </div>

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
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg bg-surface-raised border border-surface-border
                        text-sm text-slate-200 shadow-xl max-w-sm animate-pulse">
          {toast}
        </div>
      )}
    </div>
  );
}
