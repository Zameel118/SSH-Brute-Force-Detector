import { useState } from "react";

/**
 * Shared whitelist / blacklist manager with add form + remove buttons.
 */
export default function IPListManager({ title, items, onAdd, onRemove, accent = "cyan" }) {
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const accentClass =
    accent === "green"
      ? "focus:border-accent-green/50 focus:ring-accent-green/20"
      : "focus:border-accent-red/50 focus:ring-accent-red/20";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ip.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onAdd(ip.trim(), reason.trim());
      setIp("");
      setReason("");
    } catch (err) {
      setError(err.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-border">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300">{title}</h2>
      </div>
      <form onSubmit={handleSubmit} className="p-3 flex flex-col sm:flex-row gap-2 border-b border-surface-border">
        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="IP address"
          className={`flex-1 bg-surface border border-surface-border rounded-md px-3 py-2 text-sm font-mono
                      outline-none focus:ring-2 ${accentClass}`}
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="flex-1 bg-surface border border-surface-border rounded-md px-3 py-2 text-sm
                     outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500/50"
        />
        <button
          type="submit"
          disabled={busy || !ip.trim()}
          className="px-4 py-2 text-sm font-medium rounded-md bg-slate-700 hover:bg-slate-600
                     disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </form>
      {error && <p className="px-3 pt-2 text-xs text-accent-red">{error}</p>}
      <ul className="p-3 space-y-1.5 max-h-[200px] overflow-y-auto">
        {items.length === 0 && (
          <li className="text-sm text-slate-500 text-center py-3">Empty</li>
        )}
        {items.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.02]"
          >
            <div className="min-w-0">
              <span className="font-mono text-sm text-slate-200">{row.ip_address}</span>
              {row.reason && (
                <span className="ml-2 text-xs text-slate-500 truncate">{row.reason}</span>
              )}
            </div>
            <button
              onClick={() => onRemove(row.ip_address)}
              className="text-xs text-slate-500 hover:text-accent-red transition-colors"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
