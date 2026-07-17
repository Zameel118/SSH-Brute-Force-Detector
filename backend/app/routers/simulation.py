"""Simulation trigger endpoint — kicks off fake brute-force log generation."""
import asyncio

from fastapi import APIRouter, Request

from app import schemas
from app.simulator import simulate_attack

router = APIRouter(prefix="/api/simulate", tags=["simulation"])

# Prevent overlapping simulation runs
_sim_lock = asyncio.Lock()


@router.post("/attack", response_model=schemas.SimulateAttackResponse)
async def trigger_attack(body: schemas.SimulateAttackRequest, request: Request):
    settings = request.app.state.settings
    log_path = settings.simulated_log_path

    if _sim_lock.locked():
        return schemas.SimulateAttackResponse(
            message="A simulation is already running — wait for it to finish",
            lines_written=0,
            attacker_ip=body.attacker_ip,
        )

    async with _sim_lock:
        # Run the simulator; the background tailer will pick up new lines
        written = await simulate_attack(
            log_path=log_path,
            attacker_ip=body.attacker_ip,
            target_user=body.target_user,
            num_attempts=min(body.num_attempts, 50),
            include_normal_traffic=body.include_normal_traffic,
            delay_seconds=0.2,
        )

    return schemas.SimulateAttackResponse(
        message=f"Wrote {written} log lines simulating attack from {body.attacker_ip}",
        lines_written=written,
        attacker_ip=body.attacker_ip,
    )
