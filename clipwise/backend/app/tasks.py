"""Background job bodies: transcode → store → TwelveLabs → highlights, plus
ffmpeg reel and social-clip assembly.

Progress is written straight to Mongo so the API process can stream it over SSE
no matter which worker picked the job up.
"""
from __future__ import annotations

import logging
import os
import shutil
import traceback
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from . import media
from .ai import twelvelabs_client as tl
from .config import settings
from .db import get_sync_db
from .jobs import celery_app
from .mailer import EmailError, send_event_ready
from .storage import get_storage

log = logging.getLogger("clipwise.tasks")

ASPECTS = {
    "reels": ("9:16", 30, True),
    "tiktok": ("9:16", 15, True),
    "shorts": ("9:16", 60, True),
    "wide": ("16:9", 30, False),
}


def _now():
    return datetime.now(timezone.utc)


def _progress(event_id: str, *, stage: str, progress: float, message: str, status: str = "processing"):
    get_sync_db().events.update_one(
        {"_id": event_id},
        {"$set": {
            "status": status,
            "stage": stage,
            "progress": progress,
            "message": message,
            "updated_at": _now(),
        }},
    )


def _fail(event_id: str, message: str):
    log.error("event %s failed: %s", event_id, message)
    get_sync_db().events.update_one(
        {"_id": event_id},
        {"$set": {
            "status": "error",
            "message": message,
            "error_message": message,
            "updated_at": _now(),
        }},
    )


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
@celery_app.task(name="clipwise.process_event", bind=True)
def process_event_task(self, event_id: str):
    db = get_sync_db()
    storage = get_storage()
    event = db.events.find_one({"_id": event_id})
    if not event:
        log.error("process_event: no such event %s", event_id)
        return
    work = media.workdir("events", event_id)

    try:
        raw_key = event.get("raw_key")
        if not raw_key:
            raise RuntimeError("No uploaded file for this event.")

        # ---- 1. Fetch the raw upload -------------------------------------
        _progress(event_id, stage="transcode", progress=5, message="fetching the upload")
        raw_local = storage.local_path(raw_key) or storage.download(raw_key, os.path.join(work, "raw.bin"))

        # ---- 2. Probe + transcode ----------------------------------------
        _progress(event_id, stage="transcode", progress=12, message="probing the file")
        info = media.probe(raw_local)

        _progress(event_id, stage="transcode", progress=18, message="transcoding to H.264/AAC faststart MP4")
        master_local = media.transcode_to_mp4(raw_local, os.path.join(work, "master.mp4"))
        thumb_local = None
        try:
            thumb_local = media.thumbnail(master_local, os.path.join(work, "thumb.jpg"), at=min(3.0, info.duration / 3))
        except media.MediaError as exc:
            log.warning("thumbnail failed for %s: %s", event_id, exc)

        # ---- 3. Store the master -----------------------------------------
        _progress(event_id, stage="upload_storage", progress=32, message="storing the master")
        master_key = f"events/{event_id}/master.mp4"
        stored = storage.put(master_key, master_local, "video/mp4")
        update = {
            "video_key": master_key,
            "video_size": stored.size,
            "duration_seconds": round(info.duration, 2),
            "duration_min": max(1, round(info.duration / 60)),
            "width": info.width,
            "height": info.height,
            "has_video": True,
        }
        if thumb_local:
            thumb_key = f"events/{event_id}/thumb.jpg"
            storage.put(thumb_key, thumb_local, "image/jpeg")
            update["thumbnail_key"] = thumb_key
        db.events.update_one({"_id": event_id}, {"$set": update})

        # ---- 4. TwelveLabs asset + Marengo index -------------------------
        _progress(event_id, stage="index", progress=42, message="uploading to TwelveLabs")
        asset_id = tl.upload_asset(master_local, filename=f"{event_id}.mp4")
        db.events.update_one({"_id": event_id}, {"$set": {"twelvelabs_asset_id": asset_id}})

        _progress(event_id, stage="index", progress=52, message="indexing with Marengo for semantic search")
        settings_doc = db.app_settings.find_one({"_id": "twelvelabs"}) or {}
        index_id = tl.ensure_index(settings_doc.get("index_id"))
        db.app_settings.update_one({"_id": "twelvelabs"}, {"$set": {"index_id": index_id}}, upsert=True)

        stream_url = storage.url(master_key)
        video_id = tl.index_video(
            index_id,
            video_url=stream_url if stream_url else None,
            local_path=None if stream_url else master_local,
            on_progress=lambda s: _progress(event_id, stage="index", progress=60,
                                            message=f"Marengo indexing: {s}"),
        )
        db.events.update_one(
            {"_id": event_id},
            {"$set": {"twelvelabs_index_id": index_id, "twelvelabs_video_id": video_id}},
        )

        # ---- 5. Pegasus highlight detection ------------------------------
        _progress(event_id, stage="highlights", progress=72, message="detecting highlights with Pegasus")
        highlights = tl.detect_highlights(
            asset_id=asset_id,
            event_type=event.get("event_type", "wedding"),
            preferences=event.get("highlight_preferences"),
            duration_seconds=info.duration,
        )

        db.highlights.delete_many({"event_id": event_id, "source": "twelvelabs"})
        docs = []
        for h in highlights:
            docs.append({
                "_id": str(uuid.uuid4()),
                "event_id": event_id,
                "timestamp": h["timestamp"],
                "duration": h["duration"],
                "moment_type": h["moment_type"],
                "description": h["description"],
                "score": h["score"],
                "people_names": h.get("people_names", []),
                "people_ids": [],
                "source": "twelvelabs",
                "created_at": _now(),
            })
        if docs:
            db.highlights.insert_many(docs)

        # ---- 6. Finish ---------------------------------------------------
        _progress(event_id, stage="finalize", progress=96, message="compiling the timeline")
        db.events.update_one(
            {"_id": event_id},
            {"$set": {
                "status": "ready",
                "stage": "finalize",
                "progress": 100,
                "message": f"{len(docs)} highlights detected",
                "step": 5,
                "processed_at": _now(),
                "updated_at": _now(),
                "error_message": None,
            }},
        )

        owner = db.users.find_one({"_id": event.get("owner_id")})
        if owner and owner.get("email"):
            try:
                send_event_ready(owner["email"], event.get("title", "Your event"), event_id)
            except EmailError as exc:
                log.warning("could not send the ready email: %s", exc)

    except Exception as exc:  # noqa: BLE001 — surface the real reason, never a mock
        _fail(event_id, f"{type(exc).__name__}: {exc}")
        log.debug(traceback.format_exc())
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ---------------------------------------------------------------------------
# Highlight reel
# ---------------------------------------------------------------------------
@celery_app.task(name="clipwise.generate_reel", bind=True)
def generate_reel_task(self, event_id: str, vertical: bool = False, max_clips: int = 8):
    db = get_sync_db()
    storage = get_storage()
    work = media.workdir("reels", event_id)

    def prog(p: float, message: str, status: str = "processing"):
        db.reels.update_one(
            {"_id": event_id},
            {"$set": {"progress": p, "message": message, "status": status,
                      "vertical": vertical, "updated_at": _now()}},
            upsert=True,
        )

    try:
        event = db.events.find_one({"_id": event_id})
        if not event:
            raise RuntimeError("Event not found.")
        if not event.get("video_key"):
            raise RuntimeError("This event has no transcoded master to cut from.")

        highlights = list(
            db.highlights.find({"event_id": event_id}).sort("score", -1).limit(int(max_clips))
        )
        if not highlights:
            raise RuntimeError("No highlights to assemble — run AI processing first.")
        highlights.sort(key=lambda h: h.get("timestamp", 0))

        prog(8, "fetching the master")
        master = storage.local_path(event["video_key"]) or storage.download(
            event["video_key"], os.path.join(work, "master.mp4")
        )

        parts: List[str] = []
        for i, h in enumerate(highlights):
            prog(10 + (i / len(highlights)) * 70, f"cutting clip {i + 1} of {len(highlights)}")
            part = os.path.join(work, f"part-{i:03d}.mp4")
            media.cut_segment(master, part, float(h.get("timestamp", 0)),
                              float(h.get("duration", 8)), vertical=vertical)
            parts.append(part)

        prog(84, "concatenating")
        out = media.concat(parts, os.path.join(work, "reel.mp4"))

        prog(92, "storing the reel")
        key = f"events/{event_id}/reel{'_vertical' if vertical else ''}.mp4"
        stored = storage.put(key, out, "video/mp4")

        db.reels.update_one(
            {"_id": event_id},
            {"$set": {
                "status": "ready", "progress": 100, "message": "ready",
                "key": key, "size": stored.size, "vertical": vertical,
                "clip_count": len(parts), "updated_at": _now(),
            }},
            upsert=True,
        )
    except Exception as exc:  # noqa: BLE001
        db.reels.update_one(
            {"_id": event_id},
            {"$set": {"status": "error", "message": f"{type(exc).__name__}: {exc}", "updated_at": _now()}},
            upsert=True,
        )
        log.debug(traceback.format_exc())
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ---------------------------------------------------------------------------
# Single social clip
# ---------------------------------------------------------------------------
@celery_app.task(name="clipwise.generate_clip", bind=True)
def generate_clip_task(self, event_id: str, clip_id: str):
    db = get_sync_db()
    storage = get_storage()
    work = media.workdir("clips", clip_id)
    try:
        clip = db.clips.find_one({"_id": clip_id})
        event = db.events.find_one({"_id": event_id})
        if not clip or not event:
            raise RuntimeError("Clip or event not found.")
        highlight = db.highlights.find_one({"_id": clip["highlight_id"]})
        if not highlight:
            raise RuntimeError("Highlight not found.")
        if not event.get("video_key"):
            raise RuntimeError("This event has no transcoded master to cut from.")

        aspect, max_len, vertical = ASPECTS.get(clip.get("format", "reels"), ASPECTS["reels"])
        master = storage.local_path(event["video_key"]) or storage.download(
            event["video_key"], os.path.join(work, "master.mp4")
        )
        duration = min(float(highlight.get("duration", 8)), max_len)
        out = media.cut_segment(master, os.path.join(work, "clip.mp4"),
                                float(highlight.get("timestamp", 0)), duration, vertical=vertical)
        key = f"events/{event_id}/clips/{clip_id}.mp4"
        stored = storage.put(key, out, "video/mp4")
        db.clips.update_one(
            {"_id": clip_id},
            {"$set": {"status": "ready", "key": key, "size": stored.size,
                      "duration": round(duration), "updated_at": _now()}},
        )
    except Exception as exc:  # noqa: BLE001
        db.clips.update_one(
            {"_id": clip_id},
            {"$set": {"status": "error", "message": f"{type(exc).__name__}: {exc}", "updated_at": _now()}},
        )
        log.debug(traceback.format_exc())
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ---------------------------------------------------------------------------
# Ad-hoc single-highlight export used by the download buttons
# ---------------------------------------------------------------------------
def cut_highlight_sync(event: dict, highlight: dict, vertical: bool = False) -> Optional[str]:
    """Cut one highlight and return a local path. Used by download endpoints."""
    storage = get_storage()
    if not event.get("video_key"):
        return None
    work = media.workdir("downloads", str(highlight["_id"]))
    master = storage.local_path(event["video_key"]) or storage.download(
        event["video_key"], os.path.join(work, "master.mp4")
    )
    out = os.path.join(work, "highlight.mp4")
    media.cut_segment(master, out, float(highlight.get("timestamp", 0)),
                      float(highlight.get("duration", 8)), vertical=vertical)
    return out
