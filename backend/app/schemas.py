"""
Pydantic schemas — request/response shapes for the REST API.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.validators import validate_ip


# --- Events ---
class EventOut(BaseModel):
    id: int
    timestamp: datetime
    source_ip: str
    username: str
    event_type: str
    status: str
    action_taken: str
    details: str
    attempt_count: int

    model_config = {"from_attributes": True}


# --- Blocked IPs ---
class BlockedIPOut(BaseModel):
    id: int
    ip_address: str
    stage: str
    reason: str
    blocked_at: datetime
    expires_at: datetime
    is_active: bool
    attempt_count: int
    seconds_remaining: Optional[int] = None

    model_config = {"from_attributes": True}


# --- Whitelist / Blacklist ---
class IPListCreate(BaseModel):
    ip_address: str = Field(..., min_length=1, max_length=64)
    reason: str = ""

    @field_validator("ip_address")
    @classmethod
    def check_ip(cls, v: str) -> str:
        return validate_ip(v)


class IPListOut(BaseModel):
    id: int
    ip_address: str
    reason: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Config ---
class DetectionConfigOut(BaseModel):
    mode: str
    log_path: str
    alert_threshold: int
    rate_limit_threshold: int
    block_threshold: int
    time_window_minutes: int
    unblock_after_hours: int
    admin_ip: str


class ModeUpdate(BaseModel):
    mode: str = Field(..., pattern="^(simulation|live)$")


class ConfigUpdate(BaseModel):
    alert_threshold: Optional[int] = None
    rate_limit_threshold: Optional[int] = None
    block_threshold: Optional[int] = None
    time_window_minutes: Optional[int] = None
    unblock_after_hours: Optional[int] = None
    admin_ip: Optional[str] = None
    live_log_path: Optional[str] = None


# --- Simulation ---
class SimulateAttackRequest(BaseModel):
    attacker_ip: str = "203.0.113.50"
    target_user: str = "root"
    num_attempts: int = 20
    include_normal_traffic: bool = True

    @field_validator("attacker_ip")
    @classmethod
    def check_attacker_ip(cls, v: str) -> str:
        return validate_ip(v)


class SimulateAttackResponse(BaseModel):
    message: str
    lines_written: int
    attacker_ip: str


# --- Stats ---
class AttackPoint(BaseModel):
    time: str
    count: int


class TopIP(BaseModel):
    ip: str
    count: int
    status: str | None = None  # blocked | rate_limited | watching
    last_seen: datetime | None = None
    country_code: str | None = None
    location: str | None = None
    top_user: str | None = None
    org: str | None = None
    share: float | None = None  # % of total attack hits
    threat: int | None = None  # 0–100 composite risk
    ttl_seconds: int | None = None  # containment remaining, if any


class StatsOut(BaseModel):
    total_events: int
    total_alerts: int
    total_blocks: int
    active_blocks: int
    attacks_over_time: list[AttackPoint]
    top_attacking_ips: list[TopIP]
