"""Static demo assets and integration status."""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from ..ai import twelvelabs_client as tl
from ..config import settings
from ..mailer import is_configured as email_configured
from ..models import Integration
from ..security import current_user
from ..storage import get_storage

router = APIRouter(tags=["misc"])

ASSET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")


@router.get("/assets/{filename}")
async def asset(filename: str, request: Request):
    """Bundled demo media — same-origin so the player never hits CORS."""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Bad asset name")
    path = os.path.join(ASSET_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Asset '{filename}' is not bundled with this build.")
    media_type = "video/mp4" if filename.endswith(".mp4") else None
    return FileResponse(path, media_type=media_type, headers={"Accept-Ranges": "bytes"})


@router.get("/settings/integrations", response_model=list[Integration])
async def integrations(user=Depends(current_user)):
    storage = get_storage()
    return [
        Integration(
            key="twelvelabs",
            name="TwelveLabs",
            detail=f"{settings.twelvelabs_pegasus_model} · {settings.twelvelabs_marengo_model}",
            configured=tl.is_configured(),
        ),
        Integration(
            key="storage",
            name="Object storage",
            detail=storage.backend,
            configured=storage.backend in ("s3", "cloudinary"),
        ),
        Integration(
            key="stripe",
            name="Stripe",
            detail="subscriptions + customer portal",
            configured=bool(settings.stripe_secret_key),
        ),
        Integration(
            key="stripe_webhook",
            name="Stripe webhook",
            detail="checkout + subscription events",
            configured=bool(settings.stripe_webhook_secret),
        ),
        Integration(
            key="email",
            name="Email",
            detail=settings.email_provider,
            configured=email_configured(),
        ),
        Integration(
            key="jobs",
            name="Background jobs",
            detail="inline (dev)" if settings.run_jobs_inline else f"celery · {settings.redis_url.split('@')[-1]}",
            configured=not settings.run_jobs_inline,
        ),
    ]
