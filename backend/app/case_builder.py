"""
Build frozen attack Case File snapshots from Event + BlockedIP + Geo data.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.geo import lookup_ip

STAGE_RANK = {
    "allowed": 0,
    "watching": 0,
    "alert": 1,
    "rate_limited": 2,
    "blocked": 3,
    "unblocked": 4,
}


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _event_dict(ev: models.Event) -> dict[str, Any]:
    return {
        "id": ev.id,
        "timestamp": _iso(ev.timestamp),
        "source_ip": ev.source_ip,
        "username": ev.username or "",
        "event_type": ev.event_type,
        "status": ev.status,
        "action_taken": ev.action_taken or "",
        "details": ev.details or "",
        "attempt_count": ev.attempt_count or 0,
    }


def _peak_stage(events: list[models.Event]) -> str:
    peak = "watching"
    best = 0
    for ev in events:
        status = (ev.status or "").lower()
        et = (ev.event_type or "").lower()
        candidates = [status]
        if et == "alert":
            candidates.append("alert")
        elif et == "rate_limit":
            candidates.append("rate_limited")
        elif et == "block":
            candidates.append("blocked")
        elif et == "unblock":
            candidates.append("unblocked")
        for c in candidates:
            rank = STAGE_RANK.get(c, 0)
            if rank > best:
                best = rank
                peak = c
    return peak


def _escalation_steps(events: list[models.Event]) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    seen: set[str] = set()
    for ev in events:
        et = (ev.event_type or "").lower()
        status = (ev.status or "").lower()
        stage = None
        if et == "alert" or status == "alert":
            stage = "alert"
        elif et == "rate_limit" or status == "rate_limited":
            stage = "rate_limited"
        elif et == "block" or status == "blocked":
            stage = "blocked"
        elif et == "unblock" or status == "unblocked":
            stage = "unblocked"
        if not stage or stage in seen:
            continue
        # Only record first occurrence of each escalation stage (unblock always appends)
        if stage != "unblocked":
            seen.add(stage)
        steps.append(
            {
                "stage": stage,
                "at": _iso(ev.timestamp),
                "attempt_count": ev.attempt_count or 0,
                "action_taken": ev.action_taken or "",
                "details": ev.details or "",
            }
        )
    return steps


async def build_timeline_payload(db: Session, ip: str) -> dict[str, Any] | None:
    """Live (non-frozen) timeline for session-replay scrubber."""
    events = (
        db.query(models.Event)
        .filter(models.Event.source_ip == ip)
        .order_by(models.Event.timestamp.asc(), models.Event.id.asc())
        .all()
    )
    if not events:
        return None

    geo = await lookup_ip(db, ip) or {}
    block = (
        db.query(models.BlockedIP)
        .filter(models.BlockedIP.ip_address == ip)
        .order_by(models.BlockedIP.blocked_at.desc())
        .first()
    )

    first = events[0].timestamp
    last = events[-1].timestamp
    usernames = sorted({e.username for e in events if e.username})
    max_attempts = max((e.attempt_count or 0 for e in events), default=0)
    peak = _peak_stage(events)

    blocked_duration_seconds = None
    blocked_at = None
    expires_at = None
    block_stage = None
    if block:
        blocked_at = block.blocked_at
        expires_at = block.expires_at
        block_stage = block.stage
        if block.blocked_at and block.expires_at:
            blocked_duration_seconds = int(
                (block.expires_at - block.blocked_at).total_seconds()
            )

    return {
        "source_ip": ip,
        "geo": {
            "ip": ip,
            "country": geo.get("country") or "",
            "country_code": geo.get("country_code") or "",
            "city": geo.get("city") or "",
            "latitude": geo.get("latitude") or "",
            "longitude": geo.get("longitude") or "",
            "org": geo.get("org") or "",
            "label": geo.get("label") or geo.get("raw_label") or "",
        },
        "summary": {
            "event_count": len(events),
            "first_seen": _iso(first),
            "last_seen": _iso(last),
            "peak_stage": peak,
            "blocked_duration_seconds": blocked_duration_seconds,
            "blocked_at": _iso(blocked_at),
            "expires_at": _iso(expires_at),
            "block_stage": block_stage,
            "usernames": usernames,
            "attempt_count_max": max_attempts,
            "is_active": bool(block and block.is_active),
        },
        "escalation_steps": _escalation_steps(events),
        "timeline": [_event_dict(e) for e in events],
    }


async def build_case_snapshot(db: Session, ip: str, title: str = "") -> dict[str, Any] | None:
    payload = await build_timeline_payload(db, ip)
    if not payload:
        return None
    now = datetime.now(timezone.utc)
    payload["title"] = title.strip() or f"Case / {ip}"
    payload["frozen_at"] = _iso(now)
    payload["read_only"] = True
    return payload
