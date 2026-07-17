"""
Detection engine — sliding time-window tracker per source IP.

Keeps a dict of IP -> list of failed-attempt timestamps. When the number of
failures inside the configured window crosses a threshold, the escalation
engine is notified.
"""
from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Deque


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
        # IP -> deque of failure timestamps (newest at the right)
        self._failures: dict[str, Deque[datetime]] = defaultdict(deque)
        # Track the highest stage already triggered for an IP in this window
        # so we don't re-fire the same stage on every subsequent failure
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

    def _prune(self, ip: str, now: datetime) -> None:
        """Drop timestamps that fall outside the sliding window."""
        cutoff = now - self.time_window
        q = self._failures[ip]
        while q and q[0] < cutoff:
            q.popleft()
        if not q:
            # Window emptied — allow stages to re-trigger on a new burst
            self._stage_reached.pop(ip, None)

    def record_failure(self, ip: str, timestamp: datetime | None = None) -> tuple[int, str | None]:
        """
        Record a failed login from `ip`.

        Returns (attempt_count_in_window, new_stage_or_None).
        new_stage is one of: "alert", "rate_limit", "block" — only when that
        stage is crossed for the first time in the current window.
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

        return count, new_stage

    def get_count(self, ip: str) -> int:
        self._prune(ip, datetime.now(timezone.utc))
        return len(self._failures[ip])

    def clear_ip(self, ip: str) -> None:
        """Reset tracking for an IP (e.g. after manual unblock)."""
        self._failures.pop(ip, None)
        self._stage_reached.pop(ip, None)
