"""Prometheus-style /metrics endpoint for observability demos."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

router = APIRouter(tags=["metrics"])


@router.get("/metrics", response_class=Response)
def prometheus_metrics(db: Session = Depends(get_db)):
    """
    Expose detector counters in Prometheus text exposition format.
    Scrape with: curl http://localhost:8000/metrics
    """
    total_events = db.query(models.Event).count()
    total_alerts = db.query(models.Event).filter(models.Event.event_type == "alert").count()
    total_blocks = db.query(models.Event).filter(models.Event.event_type == "block").count()
    total_rate_limits = (
        db.query(models.Event).filter(models.Event.event_type == "rate_limit").count()
    )
    failed = (
        db.query(models.Event)
        .filter(models.Event.event_type.in_(["failed_password", "invalid_user"]))
        .count()
    )
    active_blocks = (
        db.query(models.BlockedIP).filter(models.BlockedIP.is_active.is_(True)).count()
    )
    whitelist = db.query(models.WhitelistEntry).count()
    blacklist = db.query(models.BlacklistEntry).count()

    lines = [
        "# HELP ssh_detector_events_total Total stored events",
        "# TYPE ssh_detector_events_total counter",
        f"ssh_detector_events_total {total_events}",
        "# HELP ssh_detector_alerts_total Alert escalation events",
        "# TYPE ssh_detector_alerts_total counter",
        f"ssh_detector_alerts_total {total_alerts}",
        "# HELP ssh_detector_blocks_total Block escalation events",
        "# TYPE ssh_detector_blocks_total counter",
        f"ssh_detector_blocks_total {total_blocks}",
        "# HELP ssh_detector_rate_limits_total Rate-limit escalation events",
        "# TYPE ssh_detector_rate_limits_total counter",
        f"ssh_detector_rate_limits_total {total_rate_limits}",
        "# HELP ssh_detector_failed_auth_total Failed password / invalid user events",
        "# TYPE ssh_detector_failed_auth_total counter",
        f"ssh_detector_failed_auth_total {failed}",
        "# HELP ssh_detector_active_blocks Currently active blocks / rate-limits",
        "# TYPE ssh_detector_active_blocks gauge",
        f"ssh_detector_active_blocks {active_blocks}",
        "# HELP ssh_detector_whitelist_entries Whitelist size",
        "# TYPE ssh_detector_whitelist_entries gauge",
        f"ssh_detector_whitelist_entries {whitelist}",
        "# HELP ssh_detector_blacklist_entries Blacklist size",
        "# TYPE ssh_detector_blacklist_entries gauge",
        f"ssh_detector_blacklist_entries {blacklist}",
        "",
    ]
    body = "\n".join(lines)
    return Response(content=body, media_type="text/plain; version=0.0.4; charset=utf-8")
