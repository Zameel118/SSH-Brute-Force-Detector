import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export default function IPListManager({ title, items, onAdd, onRemove, accent = "cyan" }) {
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const accentBorder =
    accent === "green"
      ? "focus:border-signal-ok"
      : "focus:border-signal-danger";

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
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <h2 className="panel-title">{title}</h2>
        <span className="font-mono text-2xs text-chalk-muted tabular-nums">{items.length}</span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-3 flex flex-col sm:flex-row gap-2 border-b border-ink-line bg-ink-edge/40"
      >
        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="IP address"
          className={`flex-1 bg-ink border border-ink-line px-3 py-2 text-sm font-mono text-chalk
                      outline-none ${accentBorder} placeholder:text-chalk-faint`}
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="flex-1 bg-ink border border-ink-line px-3 py-2 text-sm font-sans text-chalk
                     outline-none focus:border-steel placeholder:text-chalk-faint"
        />
        <button type="submit" disabled={busy || !ip.trim()} className="btn-console gap-1.5">
          <Plus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
          Add
        </button>
      </form>

      {error && <p className="px-3 pt-2 text-xs text-signal-danger font-mono">{error}</p>}

      <ul className="max-h-[200px] overflow-y-auto">
        {items.length === 0 && (
          <li className="text-sm text-chalk-muted text-center py-6">Empty list</li>
        )}
        {items.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 px-3 py-2 border-b border-ink-line/60 hover:bg-ink-edge/50"
          >
            <div className="min-w-0">
              <span className="font-mono text-sm text-chalk">{row.ip_address}</span>
              {row.reason && (
                <span className="ml-2 text-xs text-chalk-muted truncate">{row.reason}</span>
              )}
            </div>
            <button
              onClick={() => onRemove(row.ip_address)}
              className="p-1.5 text-chalk-muted hover:text-signal-danger transition-colors"
              aria-label={`Remove ${row.ip_address}`}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
