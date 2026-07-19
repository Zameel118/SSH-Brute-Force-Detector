"""
Case File API — create frozen shareable attack snapshots + live timelines for replay.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app import models
from app.case_builder import build_case_snapshot, build_timeline_payload
from app.database import get_db
from app.validators import validate_ip

router = APIRouter(tags=["cases"])


class CaseCreate(BaseModel):
    source_ip: str = Field(..., min_length=1, max_length=64)
    title: str = Field(default="", max_length=256)

    @field_validator("source_ip")
    @classmethod
    def check_ip(cls, v: str) -> str:
        return validate_ip(v)


class CaseCreatedOut(BaseModel):
    public_id: str
    source_ip: str
    title: str
    created_at: datetime
    share_path: str


class CaseOut(BaseModel):
    public_id: str
    source_ip: str
    title: str
    created_at: datetime
    snapshot: dict


def _new_public_id() -> str:
    # Short, URL-safe id suitable for portfolio links
    return secrets.token_urlsafe(9)[:12]


@router.post("/api/cases", response_model=CaseCreatedOut)
async def create_case(body: CaseCreate, db: Session = Depends(get_db)):
    snapshot = await build_case_snapshot(db, body.source_ip, body.title)
    if not snapshot:
        raise HTTPException(status_code=404, detail=f"No events found for {body.source_ip}")

    public_id = _new_public_id()
    # Extremely unlikely collision; retry a few times
    for _ in range(5):
        exists = db.query(models.CaseFile).filter(models.CaseFile.public_id == public_id).first()
        if not exists:
            break
        public_id = _new_public_id()

    row = models.CaseFile(
        public_id=public_id,
        source_ip=body.source_ip,
        title=snapshot["title"],
        snapshot_json=json.dumps(snapshot),
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return CaseCreatedOut(
        public_id=row.public_id,
        source_ip=row.source_ip,
        title=row.title,
        created_at=row.created_at,
        share_path=f"/case/{row.public_id}",
    )


@router.get("/api/cases/{public_id}", response_model=CaseOut)
def get_case(public_id: str, db: Session = Depends(get_db)):
    row = db.query(models.CaseFile).filter(models.CaseFile.public_id == public_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Case file not found")
    try:
        snapshot = json.loads(row.snapshot_json or "{}")
    except json.JSONDecodeError:
        snapshot = {}
    return CaseOut(
        public_id=row.public_id,
        source_ip=row.source_ip,
        title=row.title,
        created_at=row.created_at,
        snapshot=snapshot,
    )


@router.get("/api/timeline/{ip}")
async def get_timeline(ip: str, db: Session = Depends(get_db)):
    """Live timeline for the session-replay scrubber (not frozen)."""
    try:
        ip = validate_ip(ip)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = await build_timeline_payload(db, ip)
    if not payload:
        raise HTTPException(status_code=404, detail=f"No events found for {ip}")
    return payload
