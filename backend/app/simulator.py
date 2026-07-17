"""
Log simulator — generates realistic fake SSH auth.log lines.

Used in Simulation Mode so the project works with zero real SSH traffic.
Writes to ./data/simulated_auth.log (or whatever path is configured).
"""
from __future__ import annotations

import asyncio
import os
import random
from datetime import datetime, timezone
from pathlib import Path

# Fake usernames attackers commonly try
COMMON_USERS = [
    "root", "admin", "ubuntu", "user", "test", "oracle", "postgres",
    "mysql", "ftp", "guest", "pi", "deploy", "webmaster",
]

# Benign internal-looking IPs for "normal" traffic
LEGIT_IPS = ["192.168.1.10", "192.168.1.20", "10.0.0.5", "172.16.0.8"]

HOSTNAME = "ubuntu-server"
_pid_counter = 10000


def _next_pid() -> int:
    global _pid_counter
    _pid_counter += 1
    return _pid_counter


def _ts() -> str:
    """Format timestamp like auth.log: 'Jul 17 14:22:01' (UTC)."""
    return datetime.now(timezone.utc).strftime("%b %d %H:%M:%S")


def make_failed_password(ip: str, user: str) -> str:
    return (
        f"{_ts()} {HOSTNAME} sshd[{_next_pid()}]: "
        f"Failed password for {user} from {ip} port {random.randint(40000, 65000)} ssh2"
    )


def make_invalid_user(ip: str, user: str) -> str:
    return (
        f"{_ts()} {HOSTNAME} sshd[{_next_pid()}]: "
        f"Invalid user {user} from {ip} port {random.randint(40000, 65000)}"
    )


def make_accepted(ip: str, user: str) -> str:
    method = random.choice(["password", "publickey"])
    return (
        f"{_ts()} {HOSTNAME} sshd[{_next_pid()}]: "
        f"Accepted {method} for {user} from {ip} port {random.randint(40000, 65000)} ssh2"
    )


def ensure_log_file(path: str) -> None:
    """Create the log file and parent directories if they don't exist."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        p.touch()


def append_lines(path: str, lines: list[str]) -> int:
    """Append lines to the log file. Returns how many were written."""
    ensure_log_file(path)
    with open(path, "a", encoding="utf-8") as f:
        for line in lines:
            f.write(line + "\n")
            f.flush()
            os.fsync(f.fileno())
    return len(lines)


async def simulate_attack(
    log_path: str,
    attacker_ip: str = "203.0.113.50",
    target_user: str = "root",
    num_attempts: int = 20,
    include_normal_traffic: bool = True,
    delay_seconds: float = 0.15,
) -> int:
    """
    Write a burst of failed login attempts (a brute-force attack pattern),
    optionally mixed with a few legitimate successful logins.

    delay_seconds spaces the lines out so the live tailer / WebSocket feed
    updates look realistic on the dashboard.
    """
    ensure_log_file(log_path)
    written = 0

    # A couple of normal logins first so the feed isn't only attack noise
    if include_normal_traffic:
        for _ in range(2):
            ip = random.choice(LEGIT_IPS)
            user = random.choice(["alice", "bob", "deploy"])
            line = make_accepted(ip, user)
            append_lines(log_path, [line])
            written += 1
            await asyncio.sleep(delay_seconds)

    for i in range(num_attempts):
        # Mostly attack the target user; occasionally try other common names
        user = target_user if i % 3 != 0 else random.choice(COMMON_USERS)
        if user in COMMON_USERS and user != target_user and random.random() < 0.4:
            line = make_invalid_user(attacker_ip, user)
        else:
            line = make_failed_password(attacker_ip, user)
        append_lines(log_path, [line])
        written += 1
        await asyncio.sleep(delay_seconds)

        # Sprinkle one legitimate login mid-attack so charts look mixed
        if include_normal_traffic and i == num_attempts // 2:
            line = make_accepted(random.choice(LEGIT_IPS), "alice")
            append_lines(log_path, [line])
            written += 1
            await asyncio.sleep(delay_seconds)

    return written


def seed_background_noise(log_path: str, count: int = 5) -> int:
    """Write a few benign lines so the log isn't empty on first boot."""
    lines = []
    for _ in range(count):
        ip = random.choice(LEGIT_IPS)
        user = random.choice(["alice", "bob", "deploy"])
        lines.append(make_accepted(ip, user))
    return append_lines(log_path, lines)
