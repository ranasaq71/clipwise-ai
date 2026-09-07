"""Public client portal — no login required, addressed by event id."""
from __future__ import annotations

import asyncio
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse

from ..config import settings
from ..db import get_db
from ..mailer import EmailError, send_portal_invite
from ..media import MediaError
from ..models import InviteRequest
from ..security import current_user
from ..streaming import serve_media
from ..tasks import cut_highlight_sync
from .deps import get_event, highlight_out, person_out, product_out

router = APIRouter(tags=["portal"])


def _safe(name: str) -> str:
    return re.sub(r"[^\w\-]+", "_", name or "clip").strip("_") or "clip"


async def _public_event(event_id: str) -> dict:
    event = await get_db().events.find_one({"_id": event_id})
    if not event:
        raise HTTPException(status_code=404, detail="Portal not found.")
    if event.get("status") != "ready":
        raise HTTPException(status_code=404, detail="This event isn't published yet.")
    return event


@router.get("/portal/{event_id}")
async def portal(event_id: str):
    event = await _public_event(event_id)
    db = get_db()
    people = [p async for p in db.people.find({"event_id": event_id})]
    highlights = [h async for h in db.highlights.find({"event_id": event_id}).sort("timestamp", 1)]
    products = [p async for p in db.products.find({"event_id": event_id, "approved": True})]

    counts = {}
    async for a in db.appearances.find({"event_id": event_id}):
        counts[a["person_id"]] = counts.get(a["person_id"], 0) + 1

    return {
        "event": {
            "id": event_id,
            "title": event.get("title"),
            "event_type": event.get("event_type"),
            "duration_min": event.get("duration_min", 0),
            "studio_name": event.get("studio_name", "ClipWise Studio"),
            "brand_color": event.get("brand_color", "#FFB000"),
            "has_video": bool(event.get("video_key")),
            "thumbnail_url": (f"{settings.public_base_url}/api/portal/{event_id}/thumbnail"
                              if event.get("thumbnail_key") else None),
        },
        "people": [
            {**person_out(p, counts.get(p["_id"], 0)), "descriptors": []}  # never expose biometrics publicly
            for p in people
        ],
        "highlights": [highlight_out(h) for h in highlights],
        "products": [product_out(p) for p in products],
    }


@router.get("/portal/{event_id}/find_me")
async def find_me(event_id: str, name: str = Query(..., min_length=1)):
    await _public_event(event_id)
    db = get_db()
    needle = name.strip().lower()
    people = [p async for p in db.people.find({"event_id": event_id})]
    matches = [p for p in people if needle in (p.get("name") or "").lower()]
    if not matches:
        return {"matches": [], "highlights": [], "total_highlights": 0}

    ids = [p["_id"] for p in matches]
    highlights = [
        h async for h in db.highlights.find({"event_id": event_id, "people_ids": {"$in": ids}}).sort("timestamp", 1)
    ]
    if not highlights:
        # Fall back to raw appearances when highlights haven't been tagged yet.
        appearances = [a async for a in db.appearances.find(
            {"event_id": event_id, "person_id": {"$in": ids}}).sort("timestamp", 1)]
        highlights = [{
            "_id": str(a["_id"]), "timestamp": a["timestamp"], "duration": 8,
            "moment_type": "On screen", "description": "", "score": a.get("confidence", 90),
            "people_ids": [a["person_id"]],
        } for a in appearances]

    return {
        "matches": [{"id": p["_id"], "name": p.get("name"), "role": p.get("role"),
                     "confidence": p.get("confidence", 90)} for p in matches],
        "highlights": [highlight_out(h) for h in highlights],
        "total_highlights": len(highlights),
    }


@router.get("/portal/{event_id}/stream")
async def portal_stream(event_id: str, request: Request):
    event = await _public_event(event_id)
    if not event.get("video_key"):
        raise HTTPException(status_code=404, detail="No video for this event.")
    return serve_media(request, event["video_key"], content_type="video/mp4")


@router.get("/portal/{event_id}/thumbnail")
async def portal_thumbnail(event_id: str, request: Request):
    event = await _public_event(event_id)
    if not event.get("thumbnail_key"):
        raise HTTPException(status_code=404, detail="No thumbnail.")
    return serve_media(request, event["thumbnail_key"], content_type="image/jpeg")


@router.get("/portal/{event_id}/highlights/{highlight_id}/download")
async def portal_download(event_id: str, highlight_id: str, background: BackgroundTasks):
    event = await _public_event(event_id)
    highlight = await get_db().highlights.find_one({"_id": highlight_id, "event_id": event_id})
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found.")
    if not event.get("video_key"):
        raise HTTPException(status_code=404, detail="No video for this event.")
    try:
        path = await asyncio.to_thread(cut_highlight_sync, event, highlight, False)
    except MediaError as exc:
        raise HTTPException(status_code=500, detail=f"ffmpeg could not cut this clip: {exc}")
    if not path:
        raise HTTPException(status_code=500, detail="Could not produce the clip.")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=f"{_safe(event.get('title'))}_{_safe(highlight.get('moment_type'))}.mp4",
    )


# --------------------------------------------------------------------------
# Studio-side: invite a client to the portal
# --------------------------------------------------------------------------
@router.post("/events/{event_id}/portal/invite")
async def invite(event_id: str, payload: InviteRequest, user=Depends(current_user)):
    event = await get_event(event_id, user)
    try:
        sent = send_portal_invite(
            payload.email,
            event.get("title", "Your event"),
            event.get("studio_name", "Your videographer"),
            event_id,
        )
    except EmailError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if not sent:
        raise HTTPException(
            status_code=503,
            detail="Email is not configured on the server. Set EMAIL_PROVIDER and the matching API key.",
        )
    await get_db().events.update_one(
        {"_id": event_id},
        {"$addToSet": {"portal_invites": payload.email}},
    )
    return {"ok": True, "url": f"{settings.frontend_base_url}/portal/{event_id}"}
