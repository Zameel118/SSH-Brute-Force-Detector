"""
Firewall helper — executes real ufw commands in Live Mode,
or just logs a simulated action in Simulation Mode.

Hardcoded safety: never block localhost / 127.0.0.1 / ::1 / admin_ip.
"""
from __future__ import annotations

import logging
import shutil
import subprocess

from app.config import Settings

logger = logging.getLogger("firewall")


class FirewallManager:
    def __init__(self, settings: Settings):
        self.settings = settings

    def is_protected(self, ip: str) -> bool:
        return ip in self.settings.protected_ip_set or ip in ("127.0.0.1", "::1", "localhost")

    def block_ip(self, ip: str) -> tuple[bool, str]:
        """
        Block an IP. Returns (success, message).
        In simulation mode: always succeeds with a log message.
        In live mode: runs `ufw deny from <ip>` via subprocess.
        """
        if self.is_protected(ip):
            msg = f"Refused to block protected IP {ip}"
            logger.warning(msg)
            return False, msg

        if self.settings.mode != "live":
            msg = f"[SIMULATION] Would block {ip} via ufw deny from {ip}"
            logger.info(msg)
            return True, msg

        return self._run_ufw(["deny", "from", ip], f"Blocked {ip} with ufw")

    def unblock_ip(self, ip: str) -> tuple[bool, str]:
        if self.settings.mode != "live":
            msg = f"[SIMULATION] Would unblock {ip} via ufw delete deny from {ip}"
            logger.info(msg)
            return True, msg

        return self._run_ufw(["delete", "deny", "from", ip], f"Unblocked {ip} with ufw")

    def rate_limit_ip(self, ip: str) -> tuple[bool, str]:
        """
        Rate-limit stage. ufw has `limit` which rate-limits SSH connections.
        In simulation we just log it.
        """
        if self.is_protected(ip):
            msg = f"Refused to rate-limit protected IP {ip}"
            logger.warning(msg)
            return False, msg

        if self.settings.mode != "live":
            msg = f"[SIMULATION] Would rate-limit {ip} via ufw limit from {ip}"
            logger.info(msg)
            return True, msg

        return self._run_ufw(["limit", "from", ip], f"Rate-limited {ip} with ufw")

    def _run_ufw(self, args: list[str], success_msg: str) -> tuple[bool, str]:
        if not shutil.which("ufw"):
            msg = "ufw not found on this system — cannot execute live firewall command"
            logger.error(msg)
            return False, msg
        try:
            result = subprocess.run(
                ["ufw", *args],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            if result.returncode == 0:
                logger.info(success_msg)
                return True, success_msg
            err = (result.stderr or result.stdout or "unknown error").strip()
            msg = f"ufw failed: {err}"
            logger.error(msg)
            return False, msg
        except Exception as exc:
            msg = f"ufw execution error: {exc}"
            logger.exception(msg)
            return False, msg
