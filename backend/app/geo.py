"""
GeoIP lookups with demo-first fallbacks.

Priority:
  1. Private / LAN IPs → labeled Private (no map pin)
  2. Hardcoded demo attacker IPs → always return coords (offline / recruiter demos)
  3. SQLite cache (only if it has usable lat/lon)
  4. ipapi.co (optional; free tier rate-limits aggressively)
  5. Deterministic synthetic coords from IP hash so the map never looks broken
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger("geo")

# RFC 5737 documentation / TEST-NET ranges — used by simulator + sample logs.
# These NEVER call the external API, so demos work offline and survive 403s.
_DEMO_GEO: dict[str, dict] = {
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
        "city": "Sao Paulo",
        "latitude": "-23.5505",
        "longitude": "-46.6333",
        "org": "Demo Attack Net",
        "raw_label": "BR - Brazil",
    },
    # Extra demo pins used if someone customizes the simulate IP slightly
    "203.0.113.100": {
        "country": "Germany",
        "country_code": "DE",
        "city": "Frankfurt",
        "latitude": "50.1109",
        "longitude": "8.6821",
        "org": "Demo Attack Net",
        "raw_label": "DE - Germany",
    },
    "198.51.100.77": {
        "country": "India",
        "country_code": "IN",
        "city": "Mumbai",
        "latitude": "19.0760",
        "longitude": "72.8777",
        "org": "Demo Attack Net",
        "raw_label": "IN - India",
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
    lat = float(row.latitude) if row.latitude not in ("", None) else None
    lon = float(row.longitude) if row.longitude not in ("", None) else None
    return {
        "ip": row.ip_address,
        "country": row.country,
        "country_code": row.country_code,
        "city": row.city,
        "latitude": lat,
        "longitude": lon,
        "org": row.org,
        "label": row.raw_label or "Unknown",
    }


def _has_coords(info: dict | None) -> bool:
    if not info:
        return False
    return info.get("latitude") is not None and info.get("longitude") is not None


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


def _synthetic_fallback(ip: str) -> dict:
    """
    Deterministic lat/lon from the IP hash so the map always has a pin
    when the external GeoIP API is rate-limited or offline.
    """
    digest = hashlib.md5(ip.encode("utf-8")).hexdigest()
    # Map hash bytes into a plausible land-ish band (avoid poles/oceans roughly)
    lat = (int(digest[0:4], 16) / 65535.0) * 120.0 - 60.0   # -60 .. +60
    lon = (int(digest[4:8], 16) / 65535.0) * 360.0 - 180.0  # -180 .. +180
    return {
        "country": "Unknown",
        "country_code": "XX",
        "city": "",
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon:.4f}",
        "org": "Fallback (API unavailable)",
        "raw_label": "XX - Unknown (offline)",
    }


def _demo_or_synthetic(ip: str) -> dict:
    if ip in _DEMO_GEO:
        return dict(_DEMO_GEO[ip])
    return _synthetic_fallback(ip)


async def lookup_ip(db: Session, ip: str) -> Optional[dict]:
    """Return geo info for an IP. Always returns a result for public IPs (map-safe)."""
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

    # 1) Demo IPs first — never depend on the network for recruiter demos
    if ip in _DEMO_GEO:
        row = _upsert_cache(db, ip, _DEMO_GEO[ip])
        return _row_to_dict(row)

    # 2) Cache only if it has usable coordinates
    cached = db.query(models.GeoCache).filter(models.GeoCache.ip_address == ip).first()
    if cached:
        info = _row_to_dict(cached)
        if _has_coords(info):
            return info

    # 3) Try external API (best-effort)
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(f"https://ipapi.co/{ip}/json/")
            if resp.status_code == 200:
                data = resp.json()
                if not data.get("error") and data.get("latitude") is not None:
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
            else:
                logger.warning("ipapi.co returned %s for %s — using offline fallback", resp.status_code, ip)
    except Exception:
        logger.warning("GeoIP lookup failed for %s — using offline fallback", ip, exc_info=True)

    # 4) Always fall back so the map is never empty during a demo
    payload = _demo_or_synthetic(ip)
    row = _upsert_cache(db, ip, payload)
    return _row_to_dict(row)


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
