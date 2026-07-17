"""Config + mode toggle endpoints."""
from fastapi import APIRouter, HTTPException, Request

from app import schemas
from app.config import get_settings

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("", response_model=schemas.DetectionConfigOut)
def get_config(request: Request):
    settings = request.app.state.settings
    return schemas.DetectionConfigOut(
        mode=settings.mode,
        log_path=settings.log_path,
        alert_threshold=settings.alert_threshold,
        rate_limit_threshold=settings.rate_limit_threshold,
        block_threshold=settings.block_threshold,
        time_window_minutes=settings.time_window_minutes,
        unblock_after_hours=settings.unblock_after_hours,
        admin_ip=settings.admin_ip,
    )


@router.put("/mode", response_model=schemas.DetectionConfigOut)
async def set_mode(body: schemas.ModeUpdate, request: Request):
    """
    Switch between simulation and live mode.
    Live mode requires a real auth log path and ufw — use with caution.
    """
    settings = request.app.state.settings
    settings.mode = body.mode
    # Clear cached settings so get_settings() reflects the change if used elsewhere
    get_settings.cache_clear()

    # Point the tailer at the correct log file for the new mode
    tailer = request.app.state.tailer
    new_path = settings.log_path
    if tailer.log_path != new_path:
        await tailer.stop()
        tailer.set_log_path(new_path)
        await tailer.start()

    return await get_config_response(request)


@router.put("", response_model=schemas.DetectionConfigOut)
def update_config(body: schemas.ConfigUpdate, request: Request):
    settings = request.app.state.settings
    detector = request.app.state.detector

    if body.alert_threshold is not None:
        settings.alert_threshold = body.alert_threshold
    if body.rate_limit_threshold is not None:
        settings.rate_limit_threshold = body.rate_limit_threshold
    if body.block_threshold is not None:
        settings.block_threshold = body.block_threshold
    if body.time_window_minutes is not None:
        settings.time_window_minutes = body.time_window_minutes
    if body.unblock_after_hours is not None:
        settings.unblock_after_hours = body.unblock_after_hours
    if body.admin_ip is not None:
        settings.admin_ip = body.admin_ip
    if body.live_log_path is not None:
        settings.live_log_path = body.live_log_path

    # Validate threshold ordering
    if not (
        settings.alert_threshold
        <= settings.rate_limit_threshold
        <= settings.block_threshold
    ):
        raise HTTPException(
            status_code=400,
            detail="Thresholds must satisfy: alert <= rate_limit <= block",
        )

    detector.update_thresholds(
        alert_threshold=settings.alert_threshold,
        rate_limit_threshold=settings.rate_limit_threshold,
        block_threshold=settings.block_threshold,
        time_window_minutes=settings.time_window_minutes,
    )
    get_settings.cache_clear()

    return schemas.DetectionConfigOut(
        mode=settings.mode,
        log_path=settings.log_path,
        alert_threshold=settings.alert_threshold,
        rate_limit_threshold=settings.rate_limit_threshold,
        block_threshold=settings.block_threshold,
        time_window_minutes=settings.time_window_minutes,
        unblock_after_hours=settings.unblock_after_hours,
        admin_ip=settings.admin_ip,
    )


async def get_config_response(request: Request) -> schemas.DetectionConfigOut:
    return get_config(request)
