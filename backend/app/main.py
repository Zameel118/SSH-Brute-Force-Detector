"""
SSH Brute Force Detector — FastAPI application entrypoint.

Starts:
  - REST API + WebSocket
  - Background log tailer
  - Periodic auto-unblock task
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.auth import APIKeyMiddleware
from app.config import get_settings
from app.database import SessionLocal, init_db
from app.detection import DetectionEngine
from app.escalation import EscalationService
from app.firewall import FirewallManager
from app.rate_limit import RateLimitMiddleware
from app.routers import cases as cases_router
from app.routers import config as config_router
from app.routers import demo as demo_router
from app.routers import events as events_router
from app.routers import export as export_router
from app.routers import geo as geo_router
from app.routers import ips as ips_router
from app.routers import metrics as metrics_router
from app.routers import simulation as simulation_router
from app.simulator import ensure_log_file, seed_background_noise
from app.tailer import LogTailer
from app.websocket import ws_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")


async def _auto_unblock_loop(app: FastAPI) -> None:
    """Every 60 seconds, expire blocks that have passed their unblock time."""
    while True:
        try:
            db = SessionLocal()
            try:
                count = await app.state.escalation.expire_blocks(db)
                if count:
                    logger.info("Auto-unblocked %d IP(s)", count)
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Auto-unblock loop error")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    Path("./data").mkdir(parents=True, exist_ok=True)
    ensure_log_file(settings.simulated_log_path)

    init_db()

    detector = DetectionEngine(
        alert_threshold=settings.alert_threshold,
        rate_limit_threshold=settings.rate_limit_threshold,
        block_threshold=settings.block_threshold,
        time_window_minutes=settings.time_window_minutes,
    )
    # Restore sliding-window state so restarts don't forget in-progress attacks
    db = SessionLocal()
    try:
        detector.load_from_db(db)
    finally:
        db.close()

    firewall = FirewallManager(settings)
    escalation = EscalationService(settings, detector, firewall)

    async def on_line(db, parsed):
        await escalation.process_line(db, parsed)

    tailer = LogTailer(settings.log_path, on_line)

    app.state.settings = settings
    app.state.detector = detector
    app.state.firewall = firewall
    app.state.escalation = escalation
    app.state.tailer = tailer

    log_file = Path(settings.simulated_log_path)
    if log_file.stat().st_size == 0:
        seed_background_noise(settings.simulated_log_path, count=3)

    await tailer.start()
    unblock_task = asyncio.create_task(_auto_unblock_loop(app))

    logger.info("SSH Brute Force Detector started in %s mode", settings.mode)
    logger.info("Watching log: %s", settings.log_path)
    if settings.api_key:
        logger.info("API key auth is ENABLED")

    yield

    unblock_task.cancel()
    try:
        await unblock_task
    except asyncio.CancelledError:
        pass
    await tailer.stop()
    logger.info("SSH Brute Force Detector shut down")


app = FastAPI(
    title="SSH Brute Force Detector",
    description="Monitors SSH auth logs, detects brute-force attacks, and escalates responses.",
    version="1.1.0",
    lifespan=lifespan,
)

settings = get_settings()
# IMPORTANT: do NOT combine allow_origins=["*"] with allow_credentials=True —
# browsers reject that combination and CORS fails silently for unlisted origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(APIKeyMiddleware)
app.add_middleware(
    RateLimitMiddleware,
    capacity=float(settings.api_rate_limit_burst),
    refill_per_minute=float(settings.api_rate_limit_per_minute),
)

app.include_router(events_router.router)
app.include_router(ips_router.router)
app.include_router(config_router.router)
app.include_router(simulation_router.router)
app.include_router(demo_router.router)
app.include_router(export_router.router)
app.include_router(geo_router.router)
app.include_router(metrics_router.router)
app.include_router(cases_router.router)


@app.get("/api/health")
def health():
    s = get_settings()
    return {
        "status": "ok",
        "mode": s.mode,
        "auth_required": bool(s.api_key),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    settings = get_settings()
    if hasattr(websocket.app.state, "settings"):
        settings = websocket.app.state.settings
    key = (settings.api_key or "").strip()
    if key:
        provided = websocket.query_params.get("api_key") or websocket.headers.get("x-api-key")
        if provided != key:
            await websocket.close(code=4401)
            return

    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception:
        await ws_manager.disconnect(websocket)
