"""Highlight reel, social clips, and per-highlight downloads."""
from __future__ import annotations

import asyncio
import json
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from ..db import get_db
from ..jobs import submit
from ..media import MediaError
from ..models import ApproveRequest, ClipRequest, ReelRequest
from ..security import current_user
from ..storage import get_storage
from ..streaming import serve_media
from ..tasks import ASPECTS, cut_highlight_sync, generate_clip_task, generate_reel_task
from .deps import clip_out, get_event, product_out

router = APIRouter(prefix="/events", tags=["exports"])


def _now():
    return datetime.now(timezone.utc)


def _safe(name: str) -> str:
    return re.sub(r"[^\w\-]+", "_", name or "event").strip("_") or "event"


# ---------------------------------------------------------------------------
# Highlight reel
# ---------------------------------------------------------------------------
@router.get("/{event_id}/reel")
async def get_reel(event_id: str, user=Depends(current_user)):
    await get_event(event_id, user)
    reel = await get_db().reels.find_one({"_id": event_id})
    if not reel:
        return {"status": "none", "progress": 0}
    return {
        "status": reel.get("status", "none"),
        "progress": reel.get("progress", 0),
        "message": reel.get("message"),
        "vertical": reel.get("vertical", False),
        "clip_count": reel.get("clip_count", 0),
        "size": reel.get("size", 0),
    }


@router.post("/{event_id}/reel")
async def create_reel(event_id: str, payload: ReelRequest, user=Depends(current_user)):
    event = await get_event(event_id, user)
    if not event.get("video_key"):
        raise HTTPException(status_code=400, detail="This event has no transcoded master to cut from.")
    count = await get_db().highlights.count_documents({"event_id": event_id})
    if count == 0:
        raise HTTPException(status_code=400, detail="No highlights yet — run AI processing first.")
    await get_db().reels.update_one(
        {"_id": event_id},
        {"$set": {"status": "processing", "progress": 1, "message": "queued",
                  "vertical": payload.vertical, "updated_at": _now()}},
        upsert=True,
    )
    submit(generate_reel_task, event_id, payload.vertical, payload.max_clips)
    return {"status": "processing", "progress": 1, "message": "queued", "vertical": payload.vertical}


@router.get("/{event_id}/reel/progress")
async def reel_progress(event_id: str, request: Request, user=Depends(current_user)):
    await get_event(event_id, user)
    db = get_db()

    async def gen():
        last = None
        for _ in range(60 * 60):
            if await request.is_disconnected():
                break
            reel = await db.reels.find_one({"_id": event_id}) or {}
            payload = {
                "status": reel.get("status", "none"),
                "progress": reel.get("progress", 0),
                "message": reel.get("message"),
                "vertical": reel.get("vertical", False),
                "clip_count": reel.get("clip_count", 0),
            }
            if payload != last:
                yield f"data: {json.dumps(payload)}\n\n"
                last = payload
            if payload["status"] in ("ready", "error"):
                break
            await asyncio.sleep(1.0)
        yield "event: close\ndata: {}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/{event_id}/reel/download")
async def download_reel(event_id: str, request: Request, user=Depends(current_user)):
    event = await get_event(event_id, user)
    reel = await get_db().reels.find_one({"_id": event_id})
    if not reel or reel.get("status") != "ready" or not reel.get("key"):
        raise HTTPException(status_code=404, detail="No finished reel for this event yet.")
    return serve_media(
        request, reel["key"],
        content_type="video/mp4",
        download_name=f"{_safe(event.get('title'))}_highlights.mp4",
    )


# ---------------------------------------------------------------------------
# Social clips
# ---------------------------------------------------------------------------
@router.get("/{event_id}/clips")
async def list_clips(event_id: str, user=Depends(current_user)):
    await get_event(event_id, user)
    cursor = get_db().clips.find({"event_id": event_id}).sort("created_at", -1)
    return [clip_out(c) async for c in cursor]


@router.post("/{event_id}/clips", status_code=201)
async def create_clip(event_id: str, payload: ClipRequest, user=Depends(current_user)):
    event = await get_event(event_id, user)
    db = get_db()
    if not event.get("video_key"):
        raise HTTPException(status_code=400, detail="This event has no transcoded master to cut from.")
    highlight = await db.highlights.find_one({"_id": payload.highlight_id, "event_id": event_id})
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found.")
    if payload.format not in ASPECTS:
        raise HTTPException(status_code=400, detail=f"Unknown clip format '{payload.format}'.")

    aspect, max_len, _vertical = ASPECTS[payload.format]
    clip = {
        "_id": str(uuid.uuid4()),
        "event_id": event_id,
        "highlight_id": payload.highlight_id,
        "format": payload.format,
        "aspect": aspect,
        "duration": min(int(highlight.get("duration", 8)), max_len),
        "label": f"{highlight.get('moment_type', 'Highlight')} · {payload.format.title()}",
        "status": "processing",
        "created_at": _now(),
    }
    await db.clips.insert_one(clip)
    submit(generate_clip_task, event_id, clip["_id"])
    return clip_out(clip)


@router.get("/{event_id}/clips/{clip_id}/stream")
async def stream_clip(event_id: str, clip_id: str, request: Request, user=Depends(current_user)):
    await get_event(event_id, user)
    clip = await get_db().clips.find_one({"_id": clip_id, "event_id": event_id})
    if not clip or not clip.get("key"):
        raise HTTPException(status_code=404, detail="Clip is not ready.")
    return serve_media(request, clip["key"], content_type="video/mp4")


@router.get("/{event_id}/clips/{clip_id}/download")
async def download_clip(event_id: str, clip_id: str, request: Request, user=Depends(current_user)):
    event = await get_event(event_id, user)
    clip = await get_db().clips.find_one({"_id": clip_id, "event_id": event_id})
    if not clip or not clip.get("key"):
        raise HTTPException(status_code=404, detail="Clip is not ready.")
    return serve_media(
        request, clip["key"], content_type="video/mp4",
        download_name=f"{_safe(event.get('title'))}_{clip.get('format')}.mp4",
    )


# ---------------------------------------------------------------------------
# Single-highlight download (cut on demand)
# ---------------------------------------------------------------------------
@router.get("/{event_id}/highlights/{highlight_id}/download")
async def download_highlight(
    event_id: str,
    highlight_id: str,
    background: BackgroundTasks,
    vertical: bool = False,
    user=Depends(current_user),
):
    event = await get_event(event_id, user)
    highlight = await get_db().highlights.find_one({"_id": highlight_id, "event_id": event_id})
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found.")
    if not event.get("video_key"):
        raise HTTPException(status_code=400, detail="This event has no transcoded master to cut from.")
    try:
        path = await asyncio.to_thread(cut_highlight_sync, event, highlight, vertical)
    except MediaError as exc:
        raise HTTPException(status_code=500, detail=f"ffmpeg could not cut this clip: {exc}")
    if not path:
        raise HTTPException(status_code=500, detail="Could not produce the clip.")
    filename = f"{_safe(event.get('title'))}_{_safe(highlight.get('moment_type'))}.mp4"
    return FileResponse(path, media_type="video/mp4", filename=filename)


# ---------------------------------------------------------------------------
# Shoppable products
# ---------------------------------------------------------------------------
@router.get("/{event_id}/products")
async def list_products(event_id: str, user=Depends(current_user)):
    await get_event(event_id, user)
    cursor = get_db().products.find({"event_id": event_id})
    return [product_out(p) async for p in cursor]


@router.post("/{event_id}/products/{product_id}/approve")
async def approve_product(event_id: str, product_id: str, payload: ApproveRequest, user=Depends(current_user)):
    await get_event(event_id, user)
    res = await get_db().products.update_one(
        {"_id": product_id, "event_id": event_id},
        {"$set": {"approved": payload.approved, "updated_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found.")
    return {"ok": True, "approved": payload.approved}
