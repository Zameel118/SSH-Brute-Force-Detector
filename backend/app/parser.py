"""
SSH auth.log line parser.

Parses the standard Ubuntu/Debian syslog format used by sshd, e.g.:

  Jul 17 14:22:01 hostname sshd[1234]: Failed password for root from 203.0.113.50 port 54321 ssh2
  Jul 17 14:22:05 hostname sshd[1235]: Invalid user admin from 203.0.113.50 port 54322
  Jul 17 14:23:10 hostname sshd[1236]: Accepted password for alice from 192.168.1.10 port 44444 ssh2
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

# Matches common sshd auth.log lines and captures the interesting fields
FAILED_PASSWORD_RE = re.compile(
    r"^(?P<month>\w{3})\s+(?P<day>\d{1,2})\s+(?P<time>\d{2}:\d{2}:\d{2})\s+"
    r"(?P<host>\S+)\s+sshd\[\d+\]:\s+"
    r"Failed password for (?:invalid user )?(?P<user>\S+)\s+from\s+(?P<ip>\S+)\s+port\s+(?P<port>\d+)",
    re.IGNORECASE,
)

INVALID_USER_RE = re.compile(
    r"^(?P<month>\w{3})\s+(?P<day>\d{1,2})\s+(?P<time>\d{2}:\d{2}:\d{2})\s+"
    r"(?P<host>\S+)\s+sshd\[\d+\]:\s+"
    r"Invalid user (?P<user>\S+)\s+from\s+(?P<ip>\S+)(?:\s+port\s+(?P<port>\d+))?",
    re.IGNORECASE,
)

ACCEPTED_RE = re.compile(
    r"^(?P<month>\w{3})\s+(?P<day>\d{1,2})\s+(?P<time>\d{2}:\d{2}:\d{2})\s+"
    r"(?P<host>\S+)\s+sshd\[\d+\]:\s+"
    r"Accepted (?:password|publickey) for (?P<user>\S+)\s+from\s+(?P<ip>\S+)\s+port\s+(?P<port>\d+)",
    re.IGNORECASE,
)

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


@dataclass
class ParsedLogLine:
    timestamp: datetime
    source_ip: str
    username: str
    # "failed_password" | "invalid_user" | "accepted"
    result: str
    raw: str
    port: Optional[int] = None

    @property
    def is_failure(self) -> bool:
        return self.result in ("failed_password", "invalid_user")


def _parse_timestamp(month: str, day: str, time_str: str) -> datetime:
    """
    Auth logs omit the year, so we assume the current year.
    If the resulting date is far in the future (Dec log read in Jan), roll back one year.
    """
    now = datetime.now(timezone.utc)
    hour, minute, second = (int(x) for x in time_str.split(":"))
    month_num = MONTHS.get(month, now.month)
    year = now.year
    ts = datetime(year, month_num, int(day), hour, minute, second, tzinfo=timezone.utc)
    # Handle year wrap: e.g. reading a Dec log in January
    if ts > now and (ts - now).days > 180:
        ts = ts.replace(year=year - 1)
    return ts


def parse_log_line(line: str) -> Optional[ParsedLogLine]:
    """
    Try to parse a single auth.log line.
    Returns None if the line is not an SSH auth event we care about.
    """
    line = line.strip()
    if not line or "sshd[" not in line:
        return None

    for pattern, result in (
        (FAILED_PASSWORD_RE, "failed_password"),
        (INVALID_USER_RE, "invalid_user"),
        (ACCEPTED_RE, "accepted"),
    ):
        match = pattern.match(line)
        if match:
            groups = match.groupdict()
            port = int(groups["port"]) if groups.get("port") else None
            return ParsedLogLine(
                timestamp=_parse_timestamp(groups["month"], groups["day"], groups["time"]),
                source_ip=groups["ip"],
                username=groups["user"],
                result=result,
                raw=line,
                port=port,
            )
    return None
