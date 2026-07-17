"""
Optional email alerting via SMTP.
If smtp_host is empty, send_alert() is a silent no-op so the project
works without any mail setup.
"""
from __future__ import annotations

import logging

from app.config import Settings

logger = logging.getLogger("alerting")


async def send_alert(settings: Settings, subject: str, body: str) -> bool:
    """
    Send an email alert. Returns True if sent, False if skipped/failed.
    Never raises — alerting must not break the detection pipeline.
    """
    if not settings.smtp_host or not settings.smtp_to:
        logger.debug("SMTP not configured — skipping email alert: %s", subject)
        return False

    try:
        import aiosmtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = settings.smtp_to
        msg["Subject"] = subject
        msg.set_content(body)

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            start_tls=True,
        )
        logger.info("Email alert sent: %s", subject)
        return True
    except Exception:
        logger.exception("Failed to send email alert")
        return False
