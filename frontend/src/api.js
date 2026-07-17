/**
 * Thin API client. In Docker, nginx proxies /api and /ws to the backend.
 * In local Vite dev, vite.config.js does the same proxying.
 */
const API = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
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
  health: () => request("/health"),
};

/** Build a WebSocket URL that works behind nginx and in Vite dev. */
export function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}
