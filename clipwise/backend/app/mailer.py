"""Transactional email via Resend or SendGrid.

EMAIL_PROVIDER=none turns delivery into a logged no-op so local development
doesn't need credentials — but the API tells the caller that nothing was sent
rather than pretending success.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from .config import settings

log = logging.getLogger("clipwise.mail")


class EmailError(RuntimeError):
    pass


def is_configured() -> bool:
    provider = (settings.email_provider or "none").lower()
    if provider == "resend":
        return bool(settings.resend_api_key)
    if provider == "sendgrid":
        return bool(settings.sendgrid_api_key)
    return False


def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> bool:
    provider = (settings.email_provider or "none").lower()
    if provider == "none" or not is_configured():
        log.warning("email not sent (provider=%s not configured): to=%s subject=%s", provider, to, subject)
        return False
    try:
        if provider == "resend":
            r = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={"from": settings.email_from, "to": [to], "subject": subject, "html": html},
                timeout=20.0,
            )
            r.raise_for_status()
        elif provider == "sendgrid":
            from_email = settings.email_from
            if "<" in from_email:
                name, addr = from_email.split("<", 1)
                sender = {"email": addr.rstrip(">").strip(), "name": name.strip()}
            else:
                sender = {"email": from_email}
            r = httpx.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {settings.sendgrid_api_key}"},
                json={
                    "personalizations": [{"to": [{"email": to}]}],
                    "from": sender,
                    "subject": subject,
                    "content": [{"type": "text/html", "value": html}],
                },
                timeout=20.0,
            )
            r.raise_for_status()
        else:
            raise EmailError(f"Unknown EMAIL_PROVIDER '{provider}'")
    except httpx.HTTPStatusError as exc:
        raise EmailError(f"{provider} rejected the message: {exc.response.status_code} {exc.response.text[:300]}") from exc
    except Exception as exc:
        raise EmailError(f"{provider} send failed: {exc}") from exc
    return True


# ---------------- Templates ----------------
def _shell(title: str, body: str, cta_label: Optional[str] = None, cta_url: Optional[str] = None) -> str:
    button = (
        f'<a href="{cta_url}" style="display:inline-block;background:#FFB000;color:#050505;'
        f'text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;margin-top:20px">{cta_label}</a>'
        if cta_label and cta_url else ""
    )
    return f"""<!doctype html><html><body style="margin:0;background:#050505;padding:32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#0E0E12;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:32px;color:#F5F5F7">
  <div style="font-size:13px;letter-spacing:.2em;color:#FFB000;text-transform:uppercase">ClipWise</div>
  <h1 style="font-size:26px;margin:14px 0 12px;font-weight:600">{title}</h1>
  <div style="color:#C6C6D0;font-size:15px;line-height:1.6">{body}</div>
  {button}
  <div style="margin-top:28px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;color:#565666;font-size:12px">
    ClipWise AI · Built for videographers
  </div>
</div></body></html>"""


def send_welcome(to: str, name: str) -> bool:
    return send_email(
        to,
        "Welcome to ClipWise",
        _shell(
            f"Welcome, {name}.",
            "Your studio is live. Upload raw footage and ClipWise will detect the highlights, "
            "index the faces, and give you a client portal to share.",
            "Open your studio",
            f"{settings.frontend_base_url}/app",
        ),
    )


def send_event_ready(to: str, event_title: str, event_id: str) -> bool:
    return send_email(
        to,
        f"Your event is ready — {event_title}",
        _shell(
            "Your event is ready.",
            f"<b>{event_title}</b> has finished processing. Highlights are scored, the timeline is built, "
            "and you can generate a reel whenever you like.",
            "View the event",
            f"{settings.frontend_base_url}/app/events/{event_id}",
        ),
    )


def send_portal_invite(to: str, event_title: str, studio_name: str, event_id: str) -> bool:
    return send_email(
        to,
        f"{studio_name} shared your video — {event_title}",
        _shell(
            f"{event_title} is ready to watch.",
            f"{studio_name} has published your event gallery. Search for yourself by name to jump straight "
            "to every moment you appear in, and download the clips you want.",
            "Open your gallery",
            f"{settings.frontend_base_url}/portal/{event_id}",
        ),
    )
