"""
Optional API-key gate for the dashboard/API.

When API_KEY is empty (default), auth is disabled so Simulation Mode
works with zero setup. When set, every /api/* request (except /api/health)
must include header: X-API-Key: <key>
WebSocket connections pass ?api_key= or header Sec-WebSocket-Protocol.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import get_settings

PUBLIC_PATHS = {"/api/health", "/docs", "/openapi.json", "/redoc"}


class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        # Prefer runtime settings from app.state if available (after lifespan)
        if hasattr(request.app.state, "settings"):
            settings = request.app.state.settings

        key = (settings.api_key or "").strip()
        if not key:
            return await call_next(request)

        path = request.url.path
        if path in PUBLIC_PATHS or not path.startswith("/api"):
            return await call_next(request)

        provided = request.headers.get("X-API-Key") or request.query_params.get("api_key")
        if provided != key:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid X-API-Key header"},
            )
        return await call_next(request)
