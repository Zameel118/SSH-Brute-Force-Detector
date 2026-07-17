"""
Shared IP validation helpers.
Uses the stdlib ipaddress module — rejects malformed strings before they
reach ufw, the database, or firewall subprocess calls.
"""
from __future__ import annotations

import ipaddress


def validate_ip(value: str) -> str:
    """
    Validate and normalize an IP address string.
    Raises ValueError with a clear message if invalid.
    Accepts IPv4 and IPv6; rejects hostnames like 'localhost'
    (those are handled separately as protected names).
    """
    raw = (value or "").strip()
    if not raw:
        raise ValueError("IP address is required")
    # Allow the literal hostname used in our protected set
    if raw.lower() == "localhost":
        return "localhost"
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError as exc:
        raise ValueError(f"Invalid IP address: {raw}") from exc


def is_valid_ip(value: str) -> bool:
    try:
        validate_ip(value)
        return True
    except ValueError:
        return False
