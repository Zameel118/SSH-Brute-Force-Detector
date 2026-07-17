"""
Log tailer — continuously reads new lines from the auth log file,
similar to `tail -f`. Persists byte offset in SQLite so restarts
don't reprocess old lines. Handles log rotation (file shrink / inode change).
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from app.database import SessionLocal
from app.models import TailerState
from app.parser import parse_log_line

logger = logging.getLogger("tailer")


class LogTailer:
    def __init__(self, log_path: str, on_line_callback):
        """
        on_line_callback: async function(db_session, ParsedLogLine) called for each new line.
        """
        self.log_path = log_path
        self.on_line = on_line_callback
        self._running = False
        self._task: asyncio.Task | None = None

    def set_log_path(self, path: str) -> None:
        self.log_path = path

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        # Ensure file exists so open() doesn't fail on first boot in simulation
        Path(self.log_path).parent.mkdir(parents=True, exist_ok=True)
        if not Path(self.log_path).exists():
            Path(self.log_path).touch()
        self._task = asyncio.create_task(self._loop())
        logger.info("Log tailer started on %s", self.log_path)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Log tailer stopped")

    def _get_inode(self) -> str:
        try:
            st = os.stat(self.log_path)
            return f"{st.st_dev}:{st.st_ino}"
        except OSError:
            return ""

    def _load_offset(self) -> tuple[int, str]:
        db = SessionLocal()
        try:
            row = db.query(TailerState).filter(TailerState.log_path == self.log_path).first()
            if row:
                return row.byte_offset, row.inode
            return 0, ""
        finally:
            db.close()

    def _save_offset(self, offset: int, inode: str) -> None:
        db = SessionLocal()
        try:
            row = db.query(TailerState).filter(TailerState.log_path == self.log_path).first()
            if row:
                row.byte_offset = offset
                row.inode = inode
            else:
                db.add(TailerState(log_path=self.log_path, byte_offset=offset, inode=inode))
            db.commit()
        finally:
            db.close()

    async def _loop(self) -> None:
        offset, saved_inode = self._load_offset()
        while self._running:
            try:
                path = Path(self.log_path)
                if not path.exists():
                    await asyncio.sleep(1)
                    continue

                current_inode = self._get_inode()
                size = path.stat().st_size

                # Log was rotated or truncated — start from beginning
                if (saved_inode and current_inode and current_inode != saved_inode) or size < offset:
                    logger.info("Log rotation/truncation detected — resetting offset")
                    offset = 0
                    saved_inode = current_inode

                if size > offset:
                    with open(self.log_path, "r", encoding="utf-8", errors="replace") as f:
                        f.seek(offset)
                        chunk = f.read()
                        new_offset = f.tell()

                    lines = chunk.splitlines()
                    for line in lines:
                        parsed = parse_log_line(line)
                        if parsed:
                            db = SessionLocal()
                            try:
                                await self.on_line(db, parsed)
                            except Exception:
                                logger.exception("Error processing log line")
                            finally:
                                db.close()

                    offset = new_offset
                    saved_inode = current_inode
                    self._save_offset(offset, saved_inode)

                await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Tailer loop error")
                await asyncio.sleep(2)
