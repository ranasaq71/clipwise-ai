"""Shared helpers for the event-scoped routers."""
from datetime import date, datetime
from typing import Any, Dict, Optional

from fastapi import HTTPException

from ..config import settings
from ..db import get_db


def iso(value: Any) -> Optional[str]:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


async def get_event(event_id: str, user: dict) -> dict:
    event = await get_db().events.find_one({"_id": event_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if event.get("owner_id") != user["_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="You don't have access to this event.")
    return event


def event_out(event: Dict[str, Any]) -> Dict[str, Any]:
    eid = event["_id"]
    return {
        "id": eid,
        "title": event.get("title"),
        "event_type": event.get("event_type", "wedding"),
        "event_date": iso(event.get("event_date")),
        "status": event.get("status", "draft"),
        "stage": event.get("stage"),
        "progress": event.get("progress", 0),
        "message": event.get("message"),
        "error_message": event.get("error_message"),
        "step": event.get("step", 1),
        "duration_min": event.get("duration_min", 0),
        "duration_seconds": event.get("duration_seconds", 0),
        "studio_name": event.get("studio_name", "ClipWise Studio"),
        "brand_color": event.get("brand_color", "#FFB000"),
        "highlight_preferences": event.get("highlight_preferences", []),
        "has_video": bool(event.get("video_key")),
        "is_demo": bool(event.get("is_demo")),
        "thumbnail_url": f"{settings.public_base_url}/api/events/{eid}/thumbnail" if event.get("thumbnail_key") else None,
        "twelvelabs_video_id": event.get("twelvelabs_video_id"),
        "created_at": iso(event.get("created_at")),
        "updated_at": iso(event.get("updated_at")),
    }


def highlight_out(h: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": h["_id"],
        "timestamp": h.get("timestamp", 0),
        "duration": h.get("duration", 8),
        "moment_type": h.get("moment_type", "Highlight"),
        "description": h.get("description", ""),
        "score": h.get("score", 0),
        "people_ids": h.get("people_ids", []),
        "people_names": h.get("people_names", []),
        "source": h.get("source", "twelvelabs"),
    }


def person_out(p: Dict[str, Any], appearance_count: int = 0) -> Dict[str, Any]:
    return {
        "id": p["_id"],
        "name": p.get("name"),
        "role": p.get("role"),
        "photos": p.get("photos", []),
        "descriptors": p.get("descriptors", []),
        "confidence": p.get("confidence", 90),
        "appearance_count": appearance_count or p.get("appearance_count", 0),
        "source": p.get("source", "face"),
    }


def clip_out(c: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": c["_id"],
        "highlight_id": c.get("highlight_id"),
        "format": c.get("format"),
        "aspect": c.get("aspect"),
        "duration": c.get("duration", 0),
        "label": c.get("label"),
        "status": c.get("status", "processing"),
        "message": c.get("message"),
        "created_at": iso(c.get("created_at")),
    }


def product_out(p: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": p["_id"],
        "name": p.get("name"),
        "category": p.get("category"),
        "estimated_value_usd": p.get("estimated_value_usd", 0),
        "appearances": p.get("appearances", 0),
        "confidence": p.get("confidence", 0),
        "approved": p.get("approved", False),
        "matched_person_id": p.get("matched_person_id"),
    }
