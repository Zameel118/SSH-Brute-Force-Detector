"""
WebSocket connection manager — broadcasts new events to all connected dashboard clients.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("ws")


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active.append(websocket)
        logger.info("WebSocket client connected (%d total)", len(self.active))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self.active:
                self.active.remove(websocket)
        logger.info("WebSocket client disconnected (%d total)", len(self.active))

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Send a JSON message to every connected client. Drop dead sockets silently."""
        data = json.dumps(message, default=str)
        async with self._lock:
            clients = list(self.active)

        dead: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)

        for ws in dead:
            await self.disconnect(ws)


# Singleton used across the app
ws_manager = ConnectionManager()
