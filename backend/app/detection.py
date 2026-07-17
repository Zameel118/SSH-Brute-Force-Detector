"""
Detection engine — sliding time-window tracker per source IP.

State is kept in memory for speed and also persisted to SQLite so a
backend restart mid-attack does not reset the attacker's counter to zero.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Deque

from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger("detection")


class DetectionEngine:
    def __init__(
        self,
        alert_threshold: int = 5,
        rate_limit_threshold: int = 10,
        block_threshold: int = 15,
        time_window_minutes: int = 10,
    ):
        self.alert_threshold = alert_threshold
        self.rate_limit_threshold = rate_limit_threshold
        self.block_threshold = block_threshold
        self.time_window = timedelta(minutes=time_window_minutes)
        self._failures: dict[str, Deque[datetime]] = defaultdict(deque)
        self._stage_reached: dict[str, str] = {}

    def update_thresholds(
        self,
        alert_threshold: int | None = None,
        rate_limit_threshold: int | None = None,
        block_threshold: int | None = None,
        time_window_minutes: int | None = None,
    ) -> None:
        if alert_threshold is not None:
            self.alert_threshold = alert_threshold
        if rate_limit_threshold is not None:
            self.rate_limit_threshold = rate_limit_threshold
        if block_threshold is not None:
            self.block_threshold = block_threshold
        if time_window_minutes is not None:
            self.time_window = timedelta(minutes=time_window_minutes)

    def load_from_db(self, db: Session) -> int:
        """Restore in-window failure timestamps from SQLite. Returns # of IPs loaded."""
        now = datetime.now(timezone.utc)
        rows = db.query(models.DetectionState).all()
        loaded = 0
        for row in rows:
            try:
                raw = json.loads(row.timestamps_json or "[]")
            except json.JSONDecodeError:
                continue
            q: Deque[datetime] = deque()
            for ts in raw:
                try:
                    dt = datetime.fromisoformat(ts)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    q.append(dt)
                except ValueError:
                    continue
            # Drop anything outside the current window
            cutoff = now - self.time_window
            while q and q[0] < cutoff:
                q.popleft()
            if not q:
                db.delete(row)
                continue
            self._failures[row.ip_address] = q
            if row.stage_reached:
                self._stage_reached[row.ip_address] = row.stage_reached
            loaded += 1
        db.commit()
        logger.info("Loaded detection state for %d IP(s) from DB", loaded)
        return loaded

    def _persist_ip(self, db: Session, ip: str) -> None:
        """Write one IP's window + stage back to SQLite."""
        q = self._failures.get(ip)
        stage = self._stage_reached.get(ip, "")
        if not q:
            row = db.query(models.DetectionState).filter(models.DetectionState.ip_address == ip).first()
            if row:
                db.delete(row)
                db.commit()
            return

        payload = json.dumps([t.isoformat() for t in q])
        row = db.query(models.DetectionState).filter(models.DetectionState.ip_address == ip).first()
        if row:
            row.timestamps_json = payload
            row.stage_reached = stage or ""
            row.updated_at = datetime.now(timezone.utc)
        else:
            db.add(
                models.DetectionState(
                    ip_address=ip,
                    timestamps_json=payload,
                    stage_reached=stage or "",
                )
            )
        db.commit()

    def _prune(self, ip: str, now: datetime) -> None:
        cutoff = now - self.time_window
        q = self._failures[ip]
        while q and q[0] < cutoff:
            q.popleft()
        if not q:
            self._stage_reached.pop(ip, None)

    def record_failure(
        self,
        ip: str,
        timestamp: datetime | None = None,
        db: Session | None = None,
    ) -> tuple[int, str | None]:
        """
        Record a failed login from `ip`.
        If `db` is provided, the updated window is persisted immediately.
        """
        now = timestamp or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        self._failures[ip].append(now)
        self._prune(ip, now)
        count = len(self._failures[ip])

        current_stage = self._stage_reached.get(ip)
        new_stage: str | None = None

        if count >= self.block_threshold and current_stage != "block":
            new_stage = "block"
            self._stage_reached[ip] = "block"
        elif count >= self.rate_limit_threshold and current_stage not in ("rate_limit", "block"):
            new_stage = "rate_limit"
            self._stage_reached[ip] = "rate_limit"
        elif count >= self.alert_threshold and current_stage is None:
            new_stage = "alert"
            self._stage_reached[ip] = "alert"

        if db is not None:
            self._persist_ip(db, ip)

        return count, new_stage

    def get_count(self, ip: str) -> int:
        self._prune(ip, datetime.now(timezone.utc))
        return len(self._failures[ip])

    def clear_ip(self, ip: str, db: Session | None = None) -> None:
        self._failures.pop(ip, None)
        self._stage_reached.pop(ip, None)
        if db is not None:
            row = db.query(models.DetectionState).filter(models.DetectionState.ip_address == ip).first()
            if row:
                db.delete(row)
                db.commit()

    def clear_all(self, db: Session | None = None) -> None:
        self._failures.clear()
        self._stage_reached.clear()
        if db is not None:
            db.query(models.DetectionState).delete()
            db.commit()
