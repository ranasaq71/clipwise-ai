"""Event CRUD, chunked upload, processing, streaming, and semantic search."""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse

from ..ai import twelvelabs_client as tl
from ..config import settings
from ..db import get_db
from ..jobs import submit
from ..media import workdir
from ..models import EventCreate, EventUpdate, UploadInit
from ..security import current_user
from ..storage import get_storage
from ..streaming import serve_media
from ..tasks import process_event_task
from .deps import event_out, get_event, highlight_out

router = APIRouter(prefix="/events", tags=["events"])

PLAN_LIMITS = {
    "starter": {"events": 5, "people": 10},
    "pro": {"events": 20, "people": 50},
    "agency": {"events": None, "people": None},
}


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
@router.get("")
async def list_events(user=Depends(current_user)):
    cursor = get_db().events.find({"owner_id": user["_id"]}).sort("created_at", -1)
    return [event_out(e) async for e in cursor]


@router.post("", status_code=201)
async def create_event(payload: EventCreate, user=Depends(current_user)):
    db = get_db()
    limits = PLAN_LIMITS.get(user.get("plan", "starter"), PLAN_LIMITS["starter"])
    if limits["events"] is not None:
        start_of_month = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        used = await db.events.count_documents({"owner_id": user["_id"], "created_at": {"$gte": start_of_month}})
        if used >= limits["events"] and user.get("event_credits", 0) <= 0:
            raise HTTPException(
                status_code=402,
                detail=(f"Your {user.get('plan', 'starter')} plan covers {limits['events']} events per month "
                        "and you've used them all. Upgrade, or buy a single event credit."),
            )
        if used >= limits["events"]:
            await db.users.update_one({"_id": user["_id"]}, {"$inc": {"event_credits": -1}})

    event = {
        "_id": str(uuid.uuid4()),
        "owner_id": user["_id"],
        "title": payload.title.strip(),
        "event_type": payload.event_type,
        "event_date": payload.event_date.isoformat() if payload.event_date else None,
        "status": "draft",
        "step": 1,
        "progress": 0,
        "studio_name": user.get("name", "ClipWise Studio"),
        "brand_color": "#FFB000",
        "highlight_preferences": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.events.insert_one(event)
    return event_out(event)


@router.get("/{event_id}")
async def get_one(event_id: str, user=Depends(current_user)):
    return event_out(await get_event(event_id, user))


@router.patch("/{event_id}")
async def update_event(event_id: str, payload: EventUpdate, user=Depends(current_user)):
    await get_event(event_id, user)
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "event_date" in update and update["event_date"]:
        update["event_date"] = update["event_date"].isoformat()
    update["updated_at"] = _now()
    await get_db().events.update_one({"_id": event_id}, {"$set": update})
    return event_out(await get_db().events.find_one({"_id": event_id}))


@router.delete("/{event_id}", status_code=204)
async def delete_event(event_id: str, user=Depends(current_user)):
    event = await get_event(event_id, user)
    db = get_db()
    storage = get_storage()
    for key in ("raw_key", "video_key", "thumbnail_key"):
        if event.get(key):
            try:
                storage.delete(event[key])
            except Exception:
                pass
    await asyncio.gather(
        db.events.delete_one({"_id": event_id}),
        db.highlights.delete_many({"event_id": event_id}),
        db.people.delete_many({"event_id": event_id}),
        db.appearances.delete_many({"event_id": event_id}),
        db.clips.delete_many({"event_id": event_id}),
        db.products.delete_many({"event_id": event_id}),
        db.reels.delete_many({"_id": event_id}),
    )
    return None


# ---------------------------------------------------------------------------
# Chunked upload
# ---------------------------------------------------------------------------
@router.post("/{event_id}/upload/init")
async def upload_init(event_id: str, payload: UploadInit, user=Depends(current_user)):
    await get_event(event_id, user)
    if payload.size > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"That file is {payload.size / 1_048_576:.0f} MB. The limit is "
                   f"{settings.max_upload_bytes / 1_048_576:.0f} MB.",
        )
    upload_id = str(uuid.uuid4())
    await get_db().uploads.insert_one({
        "_id": upload_id,
        "upload_id": upload_id,
        "event_id": event_id,
        "owner_id": user["_id"],
        "filename": payload.filename,
        "size": payload.size,
        "content_type": payload.content_type,
        "received": [],
        "created_at": _now(),
    })
    workdir("uploads", upload_id)
    return {"upload_id": upload_id, "chunk_size": 8 * 1024 * 1024}


@router.post("/{event_id}/upload/chunk")
async def upload_chunk(
    event_id: str,
    upload_id: str = Query(...),
    chunk_index: int = Query(...),
    total_chunks: int = Query(...),
    chunk: UploadFile = File(...),
    user=Depends(current_user),
):
    await get_event(event_id, user)
    db = get_db()
    record = await db.uploads.find_one({"_id": upload_id, "event_id": event_id})
    if not record:
        raise HTTPException(status_code=404, detail="Unknown upload session — start again.")

    part_dir = workdir("uploads", upload_id)
    part_path = os.path.join(part_dir, f"{chunk_index:06d}.part")
    written = 0
    with open(part_path, "wb") as fh:
        while True:
            data = await chunk.read(1024 * 1024)
            if not data:
                break
            fh.write(data)
            written += len(data)
    await db.uploads.update_one(
        {"_id": upload_id},
        {"$addToSet": {"received": chunk_index}, "$set": {"total_chunks": total_chunks, "updated_at": _now()}},
    )
    return {"ok": True, "chunk_index": chunk_index, "bytes": written}


@router.post("/{event_id}/upload/complete")
async def upload_complete(
    event_id: str,
    upload_id: str = Query(...),
    filename: str = Query(...),
    total_chunks: int = Query(...),
    content_type: str = Query("video/mp4"),
    user=Depends(current_user),
):
    await get_event(event_id, user)
    db = get_db()
    record = await db.uploads.find_one({"_id": upload_id, "event_id": event_id})
    if not record:
        raise HTTPException(status_code=404, detail="Unknown upload session — start again.")

    part_dir = workdir("uploads", upload_id)
    missing = [i for i in range(total_chunks) if not os.path.exists(os.path.join(part_dir, f"{i:06d}.part"))]
    if missing:
        raise HTTPException(status_code=400, detail=f"Upload incomplete — missing chunks {missing[:8]}")

    merged = os.path.join(part_dir, "merged.bin")
    with open(merged, "wb") as out:
        for i in range(total_chunks):
            with open(os.path.join(part_dir, f"{i:06d}.part"), "rb") as part:
                shutil.copyfileobj(part, out, 1024 * 1024)

    ext = os.path.splitext(filename)[1].lower() or ".mp4"
    key = f"events/{event_id}/raw{ext}"
    stored = get_storage().put(key, merged, content_type or "video/mp4")

    await db.events.update_one(
        {"_id": event_id},
        {"$set": {
            "raw_key": key,
            "raw_filename": filename,
            "raw_size": stored.size,
            "raw_content_type": content_type,
            "step": 2,
            "updated_at": _now(),
        }},
    )
    await db.uploads.delete_one({"_id": upload_id})
    shutil.rmtree(part_dir, ignore_errors=True)
    return {"ok": True, "key": key, "size": stored.size}


# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------
@router.post("/{event_id}/process")
async def start_processing(event_id: str, user=Depends(current_user)):
    event = await get_event(event_id, user)
    if not event.get("raw_key"):
        raise HTTPException(status_code=400, detail="Upload a video before starting processing.")
    if not tl.is_configured():
        raise HTTPException(
            status_code=503,
            detail="TwelveLabs is not configured on the server. Set TWELVELABS_API_KEY and try again — "
                   "ClipWise will not substitute placeholder highlights.",
        )
    await get_db().events.update_one(
        {"_id": event_id},
        {"$set": {"status": "processing", "stage": "transcode", "progress": 1,
                  "message": "queued", "error_message": None, "step": 4, "updated_at": _now()}},
    )
    job_id = submit(process_event_task, event_id)
    return {"ok": True, "job_id": job_id}


@router.get("/{event_id}/status")
async def status(event_id: str, user=Depends(current_user)):
    event = await get_event(event_id, user)
    return {
        "status": event.get("status", "draft"),
        "stage": event.get("stage"),
        "progress": event.get("progress", 0),
        "message": event.get("message") or event.get("error_message"),
        "twelvelabs_video_id": event.get("twelvelabs_video_id"),
        "has_video": bool(event.get("video_key")),
    }


@router.get("/{event_id}/progress")
async def progress_stream(event_id: str, request: Request, user=Depends(current_user)):
    """Server-sent events carrying live job progress."""
    await get_event(event_id, user)
    db = get_db()

    async def gen():
        last = None
        while True:
            if await request.is_disconnected():
                break
            event = await db.events.find_one({"_id": event_id})
            if not event:
                break
            payload = {
                "status": event.get("status", "draft"),
                "stage": event.get("stage"),
                "progress": event.get("progress", 0),
                "message": event.get("message") or event.get("error_message"),
                "twelvelabs_video_id": event.get("twelvelabs_video_id"),
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


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------
@router.get("/{event_id}/stream")
async def stream_video(event_id: str, request: Request, user=Depends(current_user)):
    event = await get_event(event_id, user)
    if not event.get("video_key"):
        raise HTTPException(status_code=404, detail="No transcoded master for this event yet.")
    return serve_media(request, event["video_key"], content_type="video/mp4")


@router.get("/{event_id}/thumbnail")
async def thumbnail(event_id: str, request: Request, user=Depends(current_user)):
    event = await get_event(event_id, user)
    if not event.get("thumbnail_key"):
        raise HTTPException(status_code=404, detail="No thumbnail for this event.")
    return serve_media(request, event["thumbnail_key"], content_type="image/jpeg")


# ---------------------------------------------------------------------------
# Highlights + search
# ---------------------------------------------------------------------------
@router.get("/{event_id}/highlights")
async def list_highlights(event_id: str, user=Depends(current_user)):
    await get_event(event_id, user)
    cursor = get_db().highlights.find({"event_id": event_id}).sort("timestamp", 1)
    return [highlight_out(h) async for h in cursor]


@router.get("/{event_id}/search")
async def semantic_search(event_id: str, q: str = Query(..., min_length=1), user=Depends(current_user)):
    """Marengo semantic search, with a name-match pass over enrolled people."""
    event = await get_event(event_id, user)
    db = get_db()

    # A name query resolves through the face index first.
    people = [p async for p in db.people.find({"event_id": event_id})]
    matches = [p for p in people if q.strip().lower() in (p.get("name", "") or "").lower()]
    if matches:
        ids = [p["_id"] for p in matches]
        appearances = [a async for a in db.appearances.find({"event_id": event_id, "person_id": {"$in": ids}})]
        results = []
        for a in sorted(appearances, key=lambda x: x.get("timestamp", 0)):
            results.append({
                "id": str(a["_id"]),
                "timestamp": a.get("timestamp", 0),
                "moment_type": f"{next((p['name'] for p in matches if p['_id'] == a['person_id']), 'Person')} on screen",
                "match_score": a.get("confidence", 90),
            })
        if results:
            return results

    if not event.get("twelvelabs_index_id") or not event.get("twelvelabs_video_id"):
        raise HTTPException(
            status_code=409,
            detail="This event isn't indexed for semantic search yet — run AI processing first.",
        )
    try:
        hits = tl.search(event["twelvelabs_index_id"], q, video_id=event["twelvelabs_video_id"])
    except tl.TwelveLabsError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return [
        {
            "id": f"s-{i}",
            "timestamp": h["timestamp"],
            "duration": h["duration"],
            "moment_type": (h.get("transcription") or q)[:70],
            "match_score": h["match_score"],
        }
        for i, h in enumerate(hits)
    ]
