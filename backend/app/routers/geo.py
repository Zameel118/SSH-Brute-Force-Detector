"""GeoIP enrichment endpoints for the dashboard map + labels."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models
from app.database import get_db
from app.geo import lookup_ip, lookup_many

router = APIRouter(prefix="/api/geo", tags=["geo"])


@router.get("/ip/{ip}")
async def geo_for_ip(ip: str, db: Session = Depends(get_db)):
    info = await lookup_ip(db, ip)
    if not info:
        return {"ip": ip, "label": "Unknown", "country": "", "country_code": ""}
    return info


@router.get("/attackers")
async def geo_attackers(db: Session = Depends(get_db)):
    """
    Unique source IPs from failure/attack events, enriched with GeoIP
    for the world-map visualization.
    """
    rows = (
        db.query(models.Event.source_ip, func.count(models.Event.id).label("cnt"))
        .filter(models.Event.event_type.in_(["failed_password", "invalid_user", "alert", "block", "rate_limit"]))
        .group_by(models.Event.source_ip)
        .order_by(func.count(models.Event.id).desc())
        .limit(50)
        .all()
    )
    ips = [r[0] for r in rows]
    counts = {r[0]: r[1] for r in rows}
    geos = await lookup_many(db, ips)
    for g in geos:
        g["attack_count"] = counts.get(g["ip"], 0)
    return geos
