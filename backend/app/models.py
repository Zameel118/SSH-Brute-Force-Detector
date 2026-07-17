"""
SQLAlchemy ORM models — the tables stored in SQLite.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Event(Base):
    """Every detection / response action is recorded here for the live feed and audit trail."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    source_ip: Mapped[str] = mapped_column(String(64), index=True)
    username: Mapped[str] = mapped_column(String(128), default="")
    # failed_password | invalid_user | accepted | alert | rate_limit | block | unblock | false_positive
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    # Status shown in the UI: allowed / alert / rate_limited / blocked / unblocked
    status: Mapped[str] = mapped_column(String(32), default="allowed")
    action_taken: Mapped[str] = mapped_column(String(128), default="")
    details: Mapped[str] = mapped_column(Text, default="")
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)


class BlockedIP(Base):
    """IPs currently blocked (or rate-limited). Auto-unblocked after expires_at."""

    __tablename__ = "blocked_ips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ip_address: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # rate_limited | blocked
    stage: Mapped[str] = mapped_column(String(32), default="blocked")
    reason: Mapped[str] = mapped_column(Text, default="")
    blocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)


class WhitelistEntry(Base):
    """Trusted IPs that must never be blocked (internal network, admin, etc.)."""

    __tablename__ = "whitelist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ip_address: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BlacklistEntry(Base):
    """Known-bad IPs that should be blocked immediately on sight."""

    __tablename__ = "blacklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ip_address: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TailerState(Base):
    """Persists the byte offset of the log file so restarts don't re-read old lines."""

    __tablename__ = "tailer_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    log_path: Mapped[str] = mapped_column(String(512), unique=True)
    byte_offset: Mapped[int] = mapped_column(Integer, default=0)
    inode: Mapped[str] = mapped_column(String(64), default="")  # detects log rotation


class DetectionState(Base):
    """
    Persists per-IP sliding-window failure timestamps + stage reached.
    Survives backend restarts so an in-progress attack isn't forgotten.
    timestamps_json stores a JSON list of ISO-8601 UTC strings.
    """

    __tablename__ = "detection_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ip_address: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    timestamps_json: Mapped[str] = mapped_column(Text, default="[]")
    stage_reached: Mapped[str] = mapped_column(String(32), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GeoCache(Base):
    """Cached GeoIP lookups so we don't hammer the free API on every request."""

    __tablename__ = "geo_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ip_address: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    country: Mapped[str] = mapped_column(String(128), default="")
    country_code: Mapped[str] = mapped_column(String(8), default="")
    city: Mapped[str] = mapped_column(String(128), default="")
    latitude: Mapped[str] = mapped_column(String(32), default="")
    longitude: Mapped[str] = mapped_column(String(32), default="")
    org: Mapped[str] = mapped_column(String(256), default="")
    raw_label: Mapped[str] = mapped_column(String(256), default="")  # e.g. "RU · Russia"
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
