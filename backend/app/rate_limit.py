"""
In-memory token-bucket rate limiter for write endpoints.

Protects demo deployments from accidental / abusive hammering of
simulate, unblock, list mutations, etc. Read endpoints stay unlimited.
"""
from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Paths that skip write throttling even on POST (health/metrics already GET)
SKIP_PREFIXES = ("/docs", "/openapi", "/redoc")


class TokenBucket:
    __slots__ = ("tokens", "updated")

    def __init__(self, capacity: float):
        self.tokens = capacity
        self.updated = time.monotonic()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Per-client token bucket on mutating HTTP methods under /api/*.

    Defaults (overridable via settings on the request app):
      capacity=20 requests, refill=10 tokens/minute
    """

    def __init__(self, app, capacity: float = 20.0, refill_per_minute: float = 10.0):
        super().__init__(app)
        self.capacity = capacity
        self.refill_per_sec = refill_per_minute / 60.0
        self._buckets: dict[str, TokenBucket] = defaultdict(
            lambda: TokenBucket(self.capacity)
        )
        self._lock = Lock()

    def _client_key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    def _allow(self, key: str) -> tuple[bool, float]:
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets[key]
            elapsed = now - bucket.updated
            bucket.tokens = min(
                self.capacity, bucket.tokens + elapsed * self.refill_per_sec
            )
            bucket.updated = now
            if bucket.tokens < 1.0:
                # Seconds until one token is available
                wait = (1.0 - bucket.tokens) / self.refill_per_sec if self.refill_per_sec else 60.0
                return False, max(1.0, wait)
            bucket.tokens -= 1.0
            return True, 0.0

    async def dispatch(self, request: Request, call_next):
        method = request.method.upper()
        path = request.url.path

        if method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)
        if not path.startswith("/api"):
            return await call_next(request)
        if any(path.startswith(p) for p in SKIP_PREFIXES):
            return await call_next(request)

        # Prefer live settings if present
        capacity = self.capacity
        refill = self.refill_per_sec * 60.0
        if hasattr(request.app.state, "settings"):
            s = request.app.state.settings
            capacity = float(getattr(s, "api_rate_limit_burst", capacity))
            refill = float(getattr(s, "api_rate_limit_per_minute", refill))
            self.capacity = capacity
            self.refill_per_sec = refill / 60.0

        key = self._client_key(request)
        allowed, retry_after = self._allow(key)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded — slow down write requests",
                    "retry_after_seconds": int(retry_after),
                },
                headers={"Retry-After": str(int(retry_after))},
            )
        return await call_next(request)
