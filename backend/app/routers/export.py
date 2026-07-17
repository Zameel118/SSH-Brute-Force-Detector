"""
Export endpoints — CSV incident report + printable HTML report (PDF-friendly).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/events.csv")
def export_events_csv(
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    """Download recent events as CSV — SOC-style incident export."""
    rows = (
        db.query(models.Event)
        .order_by(models.Event.timestamp.desc())
        .limit(limit)
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["id", "timestamp", "source_ip", "username", "event_type", "status", "action_taken", "attempt_count", "details"]
    )
    for ev in rows:
        writer.writerow(
            [
                ev.id,
                ev.timestamp.isoformat() if ev.timestamp else "",
                ev.source_ip,
                ev.username,
                ev.event_type,
                ev.status,
                ev.action_taken,
                ev.attempt_count,
                ev.details,
            ]
        )
    buf.seek(0)
    filename = f"ssh-detector-events-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/report.html", response_class=HTMLResponse)
def export_incident_report(db: Session = Depends(get_db)):
    """
    Printable HTML incident report (open in browser → Print → Save as PDF).
    Recruiters recognize this as SOC tooling.
    """
    now = datetime.now(timezone.utc)
    events = db.query(models.Event).order_by(models.Event.timestamp.desc()).limit(200).all()
    blocked = db.query(models.BlockedIP).filter(models.BlockedIP.is_active.is_(True)).all()
    alerts = db.query(models.Event).filter(models.Event.event_type == "alert").count()
    blocks = db.query(models.Event).filter(models.Event.event_type == "block").count()

    def esc(s: str) -> str:
        return (
            (s or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

    rows_html = "".join(
        f"<tr><td>{esc(ev.timestamp.isoformat() if ev.timestamp else '')}</td>"
        f"<td><code>{esc(ev.source_ip)}</code></td>"
        f"<td>{esc(ev.username)}</td>"
        f"<td>{esc(ev.event_type)}</td>"
        f"<td>{esc(ev.status)}</td>"
        f"<td>{esc(ev.action_taken)}</td></tr>"
        for ev in events
    )
    blocked_html = "".join(
        f"<li><code>{esc(b.ip_address)}</code> — {esc(b.stage)} "
        f"(attempts={b.attempt_count})</li>"
        for b in blocked
    ) or "<li>None</li>"

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>SSH Detector Incident Report</title>
<style>
  body {{ font-family: Georgia, serif; max-width: 960px; margin: 2rem auto; color: #111; }}
  h1 {{ border-bottom: 2px solid #111; padding-bottom: .4rem; }}
  .meta {{ color: #444; margin-bottom: 1.5rem; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
  th, td {{ border: 1px solid #ccc; padding: 6px 8px; text-align: left; }}
  th {{ background: #f0f0f0; }}
  code {{ font-family: Consolas, monospace; }}
  @media print {{ body {{ margin: 0; }} }}
</style></head><body>
<h1>SSH Brute Force Detector — Incident Report</h1>
<p class="meta">Generated (UTC): {now.isoformat()}<br/>
Total alerts: {alerts} · Total blocks: {blocks} · Active blocks: {len(blocked)}</p>
<h2>Currently Blocked / Rate-Limited</h2>
<ul>{blocked_html}</ul>
<h2>Recent Events (up to 200)</h2>
<table>
<thead><tr><th>Time</th><th>IP</th><th>User</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
<tbody>{rows_html}</tbody>
</table>
<p class="meta">Tip: use your browser Print dialog to save this report as PDF.</p>
</body></html>"""
    return HTMLResponse(html)
