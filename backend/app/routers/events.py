"""Events feed + stats endpoints."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[schemas.EventOut])
def list_events(
    limit: int = Query(100, ge=1, le=500),
    event_type: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Event).order_by(models.Event.timestamp.desc())
    if event_type:
        q = q.filter(models.Event.event_type == event_type)
    return q.limit(limit).all()


@router.get("/stats", response_model=schemas.StatsOut)
def get_stats(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)

    total_events = db.query(models.Event).count()
    total_alerts = db.query(models.Event).filter(models.Event.event_type == "alert").count()
    total_blocks = db.query(models.Event).filter(models.Event.event_type == "block").count()
    active_blocks = (
        db.query(models.BlockedIP).filter(models.BlockedIP.is_active.is_(True)).count()
    )

    # Attacks over time: bucket failed attempts into hourly bins for last 24h
    failures = (
        db.query(models.Event)
        .filter(
            models.Event.event_type.in_(["failed_password", "invalid_user", "alert", "block", "rate_limit"]),
            models.Event.timestamp >= since,
        )
        .all()
    )

    hourly: dict[str, int] = defaultdict(int)
    # Pre-fill last 24 hours so the chart has a continuous X axis
    for i in range(24):
        bucket = (now - timedelta(hours=23 - i)).strftime("%Y-%m-%d %H:00")
        hourly[bucket] = 0

    ip_counter: Counter[str] = Counter()
    for ev in failures:
        ts = ev.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        bucket = ts.strftime("%Y-%m-%d %H:00")
        if bucket in hourly:
            hourly[bucket] += 1
        if ev.event_type in ("failed_password", "invalid_user"):
            ip_counter[ev.source_ip] += 1

    attacks_over_time = [
        schemas.AttackPoint(time=k, count=v) for k, v in sorted(hourly.items())
    ]
    top_attacking_ips = [
        schemas.TopIP(ip=ip, count=count) for ip, count in ip_counter.most_common(10)
    ]

    return schemas.StatsOut(
        total_events=total_events,
        total_alerts=total_alerts,
        total_blocks=total_blocks,
        active_blocks=active_blocks,
        attacks_over_time=attacks_over_time,
        top_attacking_ips=top_attacking_ips,
    )
