"""Blocked IPs, whitelist, and blacklist CRUD."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api", tags=["ips"])


def _seconds_remaining(expires_at: datetime) -> int:
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return max(0, int((expires_at - now).total_seconds()))


@router.get("/blocked", response_model=list[schemas.BlockedIPOut])
def list_blocked(db: Session = Depends(get_db)):
    rows = (
        db.query(models.BlockedIP)
        .filter(models.BlockedIP.is_active.is_(True))
        .order_by(models.BlockedIP.blocked_at.desc())
        .all()
    )
    result = []
    for row in rows:
        out = schemas.BlockedIPOut.model_validate(row)
        out.seconds_remaining = _seconds_remaining(row.expires_at)
        result.append(out)
    return result


@router.post("/blocked/{ip}/unblock", response_model=schemas.EventOut)
async def unblock_ip(ip: str, request: Request, db: Session = Depends(get_db)):
    from app.validators import validate_ip

    try:
        ip = validate_ip(ip)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    service = request.app.state.escalation
    event = await service.unblock_ip(db, ip, reason="manual_unblock")
    if not event:
        raise HTTPException(status_code=404, detail=f"No active block for {ip}")
    return event


# --- Whitelist ---
@router.get("/whitelist", response_model=list[schemas.IPListOut])
def list_whitelist(db: Session = Depends(get_db)):
    return db.query(models.WhitelistEntry).order_by(models.WhitelistEntry.created_at.desc()).all()


@router.post("/whitelist", response_model=schemas.IPListOut, status_code=201)
def add_whitelist(body: schemas.IPListCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(models.WhitelistEntry)
        .filter(models.WhitelistEntry.ip_address == body.ip_address)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="IP already whitelisted")
    entry = models.WhitelistEntry(ip_address=body.ip_address.strip(), reason=body.reason)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/whitelist/{ip}")
def remove_whitelist(ip: str, db: Session = Depends(get_db)):
    entry = db.query(models.WhitelistEntry).filter(models.WhitelistEntry.ip_address == ip).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(entry)
    db.commit()
    return {"message": f"Removed {ip} from whitelist"}


# --- Blacklist ---
@router.get("/blacklist", response_model=list[schemas.IPListOut])
def list_blacklist(db: Session = Depends(get_db)):
    return db.query(models.BlacklistEntry).order_by(models.BlacklistEntry.created_at.desc()).all()


@router.post("/blacklist", response_model=schemas.IPListOut, status_code=201)
def add_blacklist(body: schemas.IPListCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(models.BlacklistEntry)
        .filter(models.BlacklistEntry.ip_address == body.ip_address)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="IP already blacklisted")
    entry = models.BlacklistEntry(ip_address=body.ip_address.strip(), reason=body.reason)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/blacklist/{ip}")
def remove_blacklist(ip: str, db: Session = Depends(get_db)):
    entry = db.query(models.BlacklistEntry).filter(models.BlacklistEntry.ip_address == ip).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(entry)
    db.commit()
    return {"message": f"Removed {ip} from blacklist"}
