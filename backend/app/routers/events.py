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

    # Hourly chart — last 24h only
    recent = (
        db.query(models.Event)
        .filter(
            models.Event.event_type.in_(
                ["failed_password", "invalid_user", "alert", "block", "rate_limit"]
            ),
            models.Event.timestamp >= since,
        )
        .all()
    )

    hourly: dict[str, int] = defaultdict(int)
    for i in range(24):
        bucket = (now - timedelta(hours=23 - i)).strftime("%Y-%m-%d %H:00")
        hourly[bucket] = 0

    for ev in recent:
        ts = ev.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        bucket = ts.strftime("%Y-%m-%d %H:00")
        if bucket in hourly:
            hourly[bucket] += 1

    # Top attacking IPs — failure counts + active containment
    ip_counter: Counter[str] = Counter()
    last_seen: dict[str, datetime] = {}
    user_counter: dict[str, Counter[str]] = defaultdict(Counter)

    def _note_ts(ip: str, ts: datetime | None) -> None:
        if not ts:
            return
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        prev = last_seen.get(ip)
        if prev is None or ts > prev:
            last_seen[ip] = ts

    failures = (
        db.query(models.Event)
        .filter(models.Event.event_type.in_(["failed_password", "invalid_user"]))
        .all()
    )
    for ev in failures:
        ip_counter[ev.source_ip] += 1
        _note_ts(ev.source_ip, ev.timestamp)
        if ev.username:
            user_counter[ev.source_ip][ev.username] += 1

    for ev in (
        db.query(models.Event)
        .filter(models.Event.event_type.in_(["alert", "rate_limit", "block"]))
        .all()
    ):
        if ev.source_ip not in ip_counter:
            ip_counter[ev.source_ip] = max(ev.attempt_count or 1, 1)
        _note_ts(ev.source_ip, ev.timestamp)
        if ev.username:
            user_counter[ev.source_ip][ev.username] += 1

    active = (
        db.query(models.BlockedIP).filter(models.BlockedIP.is_active.is_(True)).all()
    )
    for row in active:
        if row.ip_address not in ip_counter or ip_counter[row.ip_address] < (row.attempt_count or 1):
            ip_counter[row.ip_address] = max(
                ip_counter.get(row.ip_address, 0), row.attempt_count or 1
            )
        _note_ts(row.ip_address, row.blocked_at)

    stage_by_ip = {row.ip_address: row.stage for row in active}
    expires_by_ip = {row.ip_address: row.expires_at for row in active}
    top_pairs = ip_counter.most_common(15)
    top_ips = [ip for ip, _ in top_pairs]
    total_hits = sum(c for _, c in top_pairs) or 1
    max_hits = max((c for _, c in top_pairs), default=1)

    geo_by_ip: dict[str, models.GeoCache] = {}
    if top_ips:
        for row in (
            db.query(models.GeoCache)
            .filter(models.GeoCache.ip_address.in_(top_ips))
            .all()
        ):
            geo_by_ip[row.ip_address] = row

    attacks_over_time = [
        schemas.AttackPoint(time=k, count=v) for k, v in sorted(hourly.items())
    ]
    top_attacking_ips: list[schemas.TopIP] = []
    for ip, count in top_pairs:
        geo = geo_by_ip.get(ip)
        users = user_counter.get(ip)
        top_user = users.most_common(1)[0][0] if users else None
        code = (geo.country_code if geo else None) or None
        loc = None
        if geo:
            loc = geo.raw_label or (
                f"{geo.country_code} · {geo.country}".strip(" ·")
                if geo.country_code or geo.country
                else None
            )
        status = stage_by_ip.get(ip) or "watching"
        share = round(100.0 * count / total_hits, 1)
        # Threat: volume + containment weight
        volume = int(55 * (count / max_hits))
        stage_bonus = {"blocked": 40, "rate_limited": 25, "watching": 5}.get(status, 5)
        threat = min(100, volume + stage_bonus)

        ttl_seconds = None
        exp = expires_by_ip.get(ip)
        if exp is not None:
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            ttl_seconds = max(0, int((exp - now).total_seconds()))

        top_attacking_ips.append(
            schemas.TopIP(
                ip=ip,
                count=count,
                status=status,
                last_seen=last_seen.get(ip),
                country_code=code,
                location=loc,
                top_user=top_user,
                org=(geo.org if geo and geo.org else None),
                share=share,
                threat=threat,
                ttl_seconds=ttl_seconds,
            )
        )

    return schemas.StatsOut(
        total_events=total_events,
        total_alerts=total_alerts,
        total_blocks=total_blocks,
        active_blocks=active_blocks,
        attacks_over_time=attacks_over_time,
        top_attacking_ips=top_attacking_ips,
    )
