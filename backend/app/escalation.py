"""
Escalation + event processing service.

Takes a parsed log line, checks whitelist/blacklist, runs detection,
applies the appropriate response stage, persists events, and broadcasts
to WebSocket clients.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import models
from app.alerting import send_alert
from app.config import Settings
from app.detection import DetectionEngine
from app.firewall import FirewallManager
from app.parser import ParsedLogLine
from app.websocket import ws_manager

logger = logging.getLogger("escalation")


def event_to_dict(event: models.Event) -> dict:
    return {
        "id": event.id,
        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        "source_ip": event.source_ip,
        "username": event.username,
        "event_type": event.event_type,
        "status": event.status,
        "action_taken": event.action_taken,
        "details": event.details,
        "attempt_count": event.attempt_count,
    }


class EscalationService:
    def __init__(
        self,
        settings: Settings,
        detector: DetectionEngine,
        firewall: FirewallManager,
    ):
        self.settings = settings
        self.detector = detector
        self.firewall = firewall

    def _is_whitelisted(self, db: Session, ip: str) -> bool:
        return (
            db.query(models.WhitelistEntry)
            .filter(models.WhitelistEntry.ip_address == ip)
            .first()
            is not None
        )

    def _is_blacklisted(self, db: Session, ip: str) -> bool:
        return (
            db.query(models.BlacklistEntry)
            .filter(models.BlacklistEntry.ip_address == ip)
            .first()
            is not None
        )

    def _save_event(
        self,
        db: Session,
        *,
        source_ip: str,
        username: str,
        event_type: str,
        status: str,
        action_taken: str = "",
        details: str = "",
        attempt_count: int = 0,
        timestamp: datetime | None = None,
    ) -> models.Event:
        event = models.Event(
            timestamp=timestamp or datetime.now(timezone.utc),
            source_ip=source_ip,
            username=username,
            event_type=event_type,
            status=status,
            action_taken=action_taken,
            details=details,
            attempt_count=attempt_count,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    async def _broadcast_event(self, event: models.Event) -> None:
        await ws_manager.broadcast({"type": "event", "data": event_to_dict(event)})

    def _get_active_block(self, db: Session, ip: str) -> models.BlockedIP | None:
        return (
            db.query(models.BlockedIP)
            .filter(models.BlockedIP.ip_address == ip, models.BlockedIP.is_active.is_(True))
            .first()
        )

    async def _apply_stage(
        self,
        db: Session,
        ip: str,
        username: str,
        stage: str,
        attempt_count: int,
        timestamp: datetime,
    ) -> models.Event | None:
        """Apply alert / rate_limit / block for an IP that crossed a threshold."""
        if self.firewall.is_protected(ip):
            event = self._save_event(
                db,
                source_ip=ip,
                username=username,
                event_type="false_positive",
                status="allowed",
                action_taken="skipped_protected_ip",
                details=f"Threshold crossed ({stage}) but IP is protected/admin",
                attempt_count=attempt_count,
                timestamp=timestamp,
            )
            await self._broadcast_event(event)
            return event

        if self._is_whitelisted(db, ip):
            event = self._save_event(
                db,
                source_ip=ip,
                username=username,
                event_type="false_positive",
                status="allowed",
                action_taken="skipped_whitelist",
                details=f"Threshold crossed ({stage}) but IP is whitelisted",
                attempt_count=attempt_count,
                timestamp=timestamp,
            )
            await self._broadcast_event(event)
            return event

        expires = datetime.now(timezone.utc) + timedelta(hours=self.settings.unblock_after_hours)

        if stage == "alert":
            event = self._save_event(
                db,
                source_ip=ip,
                username=username,
                event_type="alert",
                status="alert",
                action_taken="alert_admin",
                details=f"{attempt_count} failed attempts within window — alerting",
                attempt_count=attempt_count,
                timestamp=timestamp,
            )
            await send_alert(
                self.settings,
                subject=f"[SSH Detector] Alert: possible brute force from {ip}",
                body=(
                    f"IP {ip} has {attempt_count} failed SSH attempts.\n"
                    f"Last username tried: {username}\n"
                    f"Mode: {self.settings.mode}\n"
                ),
            )
            await self._broadcast_event(event)
            return event

        if stage == "rate_limit":
            ok, msg = self.firewall.rate_limit_ip(ip)
            existing = self._get_active_block(db, ip)
            if existing:
                existing.stage = "rate_limited"
                existing.attempt_count = attempt_count
                existing.reason = msg
                existing.expires_at = expires
            else:
                db.add(
                    models.BlockedIP(
                        ip_address=ip,
                        stage="rate_limited",
                        reason=msg,
                        expires_at=expires,
                        attempt_count=attempt_count,
                    )
                )
            db.commit()
            event = self._save_event(
                db,
                source_ip=ip,
                username=username,
                event_type="rate_limit",
                status="rate_limited",
                action_taken="rate_limit" if ok else "rate_limit_failed",
                details=msg,
                attempt_count=attempt_count,
                timestamp=timestamp,
            )
            await self._broadcast_event(event)
            await ws_manager.broadcast({"type": "blocked_updated"})
            return event

        if stage == "block":
            ok, msg = self.firewall.block_ip(ip)
            existing = self._get_active_block(db, ip)
            if existing:
                existing.stage = "blocked"
                existing.attempt_count = attempt_count
                existing.reason = msg
                existing.expires_at = expires
                existing.blocked_at = datetime.now(timezone.utc)
            else:
                db.add(
                    models.BlockedIP(
                        ip_address=ip,
                        stage="blocked",
                        reason=msg,
                        expires_at=expires,
                        attempt_count=attempt_count,
                    )
                )
            db.commit()
            event = self._save_event(
                db,
                source_ip=ip,
                username=username,
                event_type="block",
                status="blocked",
                action_taken="block" if ok else "block_failed",
                details=msg,
                attempt_count=attempt_count,
                timestamp=timestamp,
            )
            await send_alert(
                self.settings,
                subject=f"[SSH Detector] BLOCKED {ip}",
                body=(
                    f"IP {ip} has been blocked after {attempt_count} failed attempts.\n"
                    f"Username: {username}\nDetails: {msg}\nMode: {self.settings.mode}\n"
                ),
            )
            await self._broadcast_event(event)
            await ws_manager.broadcast({"type": "blocked_updated"})
            return event

        return None

    async def process_line(self, db: Session, parsed: ParsedLogLine) -> None:
        """Main entry: handle one parsed auth log line."""
        ip = parsed.source_ip
        username = parsed.username

        # Immediate block for blacklisted IPs on any failure
        if parsed.is_failure and self._is_blacklisted(db, ip):
            if not self._get_active_block(db, ip):
                await self._apply_stage(
                    db, ip, username, "block", attempt_count=1, timestamp=parsed.timestamp
                )
            # Still record the failure attempt in the feed
            event = self._save_event(
                db,
                source_ip=ip,
                username=username,
                event_type=parsed.result,
                status="blocked",
                action_taken="blacklist_hit",
                details="Source IP is on the blacklist",
                attempt_count=1,
                timestamp=parsed.timestamp,
            )
            await self._broadcast_event(event)
            return

        if parsed.result == "accepted":
            event = self._save_event(
                db,
                source_ip=ip,
                username=username,
                event_type="accepted",
                status="allowed",
                action_taken="none",
                details="Successful SSH login",
                timestamp=parsed.timestamp,
            )
            await self._broadcast_event(event)
            return

        # Failed attempt — pass db so the sliding window survives restarts
        count, new_stage = self.detector.record_failure(ip, parsed.timestamp, db=db)

        # Always log the raw failure in the feed
        status = "allowed"
        action = "none"
        if new_stage == "alert":
            status, action = "alert", "pending_escalation"
        elif new_stage == "rate_limit":
            status, action = "rate_limited", "pending_escalation"
        elif new_stage == "block":
            status, action = "blocked", "pending_escalation"
        elif self._get_active_block(db, ip):
            block = self._get_active_block(db, ip)
            status = "blocked" if block and block.stage == "blocked" else "rate_limited"
            action = "already_blocked"

        event = self._save_event(
            db,
            source_ip=ip,
            username=username,
            event_type=parsed.result,
            status=status,
            action_taken=action,
            details=f"Failed attempt #{count} in current window",
            attempt_count=count,
            timestamp=parsed.timestamp,
        )
        await self._broadcast_event(event)

        if new_stage:
            await self._apply_stage(db, ip, username, new_stage, count, parsed.timestamp)

    async def unblock_ip(self, db: Session, ip: str, reason: str = "manual_unblock") -> models.Event | None:
        """Manually or automatically unblock an IP."""
        block = self._get_active_block(db, ip)
        if not block:
            return None

        ok, msg = self.firewall.unblock_ip(ip)
        block.is_active = False
        db.commit()
        self.detector.clear_ip(ip, db=db)

        event = self._save_event(
            db,
            source_ip=ip,
            username="",
            event_type="unblock",
            status="unblocked",
            action_taken=reason,
            details=msg if ok else f"Unblock attempted: {msg}",
            attempt_count=block.attempt_count,
        )
        await self._broadcast_event(event)
        await ws_manager.broadcast({"type": "blocked_updated"})
        return event

    async def expire_blocks(self, db: Session) -> int:
        """Auto-unblock IPs whose expires_at has passed. Returns count unblocked."""
        now = datetime.now(timezone.utc)
        expired = (
            db.query(models.BlockedIP)
            .filter(models.BlockedIP.is_active.is_(True), models.BlockedIP.expires_at <= now)
            .all()
        )
        count = 0
        for block in expired:
            await self.unblock_ip(db, block.ip_address, reason="auto_unblock_expired")
            count += 1
        return count
