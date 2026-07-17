"""
GeoIP lookups via ipapi.co free tier (no API key required for light use).
Results are cached in SQLite. Documentation IPs (TEST-NET) get fake labels
so demos work offline without hitting the API.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger("geo")

# RFC 5737 documentation / TEST-NET ranges — used by our simulator
_DEMO_GEO = {
    "203.0.113.50": {
        "country": "Russia",
        "country_code": "RU",
        "city": "Moscow",
        "latitude": "55.7558",
        "longitude": "37.6173",
        "org": "Demo Attack Net",
        "raw_label": "RU - Russia",
    },
    "203.0.113.10": {
        "country": "China",
        "country_code": "CN",
        "city": "Beijing",
        "latitude": "39.9042",
        "longitude": "116.4074",
        "org": "Demo Attack Net",
        "raw_label": "CN - China",
    },
    "198.51.100.20": {
        "country": "United States",
        "country_code": "US",
        "city": "Ashburn",
        "latitude": "39.0438",
        "longitude": "-77.4874",
        "org": "Demo Attack Net",
        "raw_label": "US - United States",
    },
    "192.0.2.99": {
        "country": "Brazil",
        "country_code": "BR",
        "city": "São Paulo",
        "latitude": "-23.5505",
        "longitude": "-46.6333",
        "org": "Demo Attack Net",
        "raw_label": "BR - Brazil",
    },
}


def _is_private(ip: str) -> bool:
    return (
        ip.startswith("10.")
        or ip.startswith("192.168.")
        or ip.startswith("127.")
        or ip.startswith("172.16.")
        or ip.startswith("172.17.")
        or ip.startswith("172.18.")
        or ip == "localhost"
        or ip.startswith("::1")
    )


def _row_to_dict(row: models.GeoCache) -> dict:
    return {
        "ip": row.ip_address,
        "country": row.country,
        "country_code": row.country_code,
        "city": row.city,
        "latitude": float(row.latitude) if row.latitude else None,
        "longitude": float(row.longitude) if row.longitude else None,
        "org": row.org,
        "label": row.raw_label,
    }


def _upsert_cache(db: Session, ip: str, data: dict) -> models.GeoCache:
    row = db.query(models.GeoCache).filter(models.GeoCache.ip_address == ip).first()
    fields = {
        "country": data.get("country", ""),
        "country_code": data.get("country_code", ""),
        "city": data.get("city", ""),
        "latitude": str(data.get("latitude") or ""),
        "longitude": str(data.get("longitude") or ""),
        "org": data.get("org", ""),
        "raw_label": data.get("raw_label", ""),
        "fetched_at": datetime.now(timezone.utc),
    }
    if row:
        for k, v in fields.items():
            setattr(row, k, v)
    else:
        row = models.GeoCache(ip_address=ip, **fields)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


async def lookup_ip(db: Session, ip: str) -> Optional[dict]:
    """Return geo info for an IP, using cache / demo map / ipapi.co."""
    if not ip or _is_private(ip):
        return {
            "ip": ip,
            "country": "Private",
            "country_code": "LAN",
            "city": "",
            "latitude": None,
            "longitude": None,
            "org": "Private network",
            "label": "LAN - Private",
        }

    cached = db.query(models.GeoCache).filter(models.GeoCache.ip_address == ip).first()
    if cached:
        return _row_to_dict(cached)

    if ip in _DEMO_GEO:
        row = _upsert_cache(db, ip, _DEMO_GEO[ip])
        return _row_to_dict(row)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"https://ipapi.co/{ip}/json/")
            if resp.status_code != 200:
                logger.warning("ipapi.co returned %s for %s", resp.status_code, ip)
                return None
            data = resp.json()
            if data.get("error"):
                return None
            code = data.get("country_code") or ""
            country = data.get("country_name") or data.get("country") or ""
            payload = {
                "country": country,
                "country_code": code,
                "city": data.get("city") or "",
                "latitude": data.get("latitude") or "",
                "longitude": data.get("longitude") or "",
                "org": data.get("org") or "",
                "raw_label": f"{code} - {country}".strip(" -") if code or country else "Unknown",
            }
            row = _upsert_cache(db, ip, payload)
            return _row_to_dict(row)
    except Exception:
        logger.exception("GeoIP lookup failed for %s", ip)
        return None


async def lookup_many(db: Session, ips: list[str]) -> list[dict]:
    results = []
    seen = set()
    for ip in ips:
        if ip in seen:
            continue
        seen.add(ip)
        info = await lookup_ip(db, ip)
        if info:
            results.append(info)
    return results
