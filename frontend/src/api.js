/**
 * Thin API client. Supports optional X-API-Key from localStorage.
 */
const API = "/api";

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  const key = localStorage.getItem("ssh_detector_api_key");
  if (key) h["X-API-Key"] = key;
  return h;
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: headers(options.headers || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail) || "Request failed");
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export const api = {
  getEvents: (limit = 100) => request(`/events?limit=${limit}`),
  getStats: () => request("/events/stats"),
  getBlocked: () => request("/blocked"),
  unblock: (ip) => request(`/blocked/${encodeURIComponent(ip)}/unblock`, { method: "POST" }),
  getWhitelist: () => request("/whitelist"),
  addWhitelist: (ip_address, reason) =>
    request("/whitelist", { method: "POST", body: JSON.stringify({ ip_address, reason }) }),
  removeWhitelist: (ip) => request(`/whitelist/${encodeURIComponent(ip)}`, { method: "DELETE" }),
  getBlacklist: () => request("/blacklist"),
  addBlacklist: (ip_address, reason) =>
    request("/blacklist", { method: "POST", body: JSON.stringify({ ip_address, reason }) }),
  removeBlacklist: (ip) => request(`/blacklist/${encodeURIComponent(ip)}`, { method: "DELETE" }),
  getConfig: () => request("/config"),
  setMode: (mode) => request("/config/mode", { method: "PUT", body: JSON.stringify({ mode }) }),
  simulateAttack: (payload = {}) =>
    request("/simulate/attack", { method: "POST", body: JSON.stringify(payload) }),
  resetDemo: () => request("/demo/reset", { method: "POST" }),
  listSamples: () => request("/samples"),
  replaySample: (sample) =>
    request("/samples/replay", { method: "POST", body: JSON.stringify({ sample }) }),
  getAttackersGeo: () => request("/geo/attackers"),
  geoForIp: (ip) => request(`/geo/ip/${encodeURIComponent(ip)}`),
  health: () => request("/health"),
  exportCsvUrl: () => {
    const key = localStorage.getItem("ssh_detector_api_key");
    return key ? `/api/export/events.csv?api_key=${encodeURIComponent(key)}` : "/api/export/events.csv";
  },
  exportReportUrl: () => {
    const key = localStorage.getItem("ssh_detector_api_key");
    return key ? `/api/export/report.html?api_key=${encodeURIComponent(key)}` : "/api/export/report.html";
  },
  fail2banUrl: () => {
    const key = localStorage.getItem("ssh_detector_api_key");
    return key ? `/api/export/fail2ban?api_key=${encodeURIComponent(key)}` : "/api/export/fail2ban";
  },
};

export function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const key = localStorage.getItem("ssh_detector_api_key");
  const q = key ? `?api_key=${encodeURIComponent(key)}` : "";
  return `${proto}//${window.location.host}/ws${q}`;
}
