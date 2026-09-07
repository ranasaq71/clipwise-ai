"""Unauthenticated endpoints powering the landing-page live demo."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..db import get_db

router = APIRouter(prefix="/public", tags=["public"])


async def _demo_event():
    event = await get_db().events.find_one({"is_demo": True})
    if not event:
        raise HTTPException(status_code=404, detail="No demo event has been seeded.")
    return event


@router.get("/demo")
async def demo():
    event = await _demo_event()
    db = get_db()
    people = [p async for p in db.people.find({"event_id": event["_id"]})]
    total = await db.highlights.count_documents({"event_id": event["_id"]})
    return {
        "event": {
            "id": event["_id"],
            "title": event.get("title"),
            "event_type": event.get("event_type"),
            "duration_min": event.get("duration_min", 240),
        },
        "people": [
            {
                "id": p["_id"],
                "name": p.get("name"),
                "role": p.get("role"),
                "confidence": p.get("confidence", 90),
                "photo_url": (p.get("photos") or [None])[0],
            }
            for p in people
        ],
        "total_highlights": total,
    }


@router.get("/demo/find_me")
async def demo_find_me(name: str = Query(..., min_length=1)):
    event = await _demo_event()
    db = get_db()
    needle = name.strip().lower()
    people = [p async for p in db.people.find({"event_id": event["_id"]})]
    matches = [p for p in people if needle in (p.get("name") or "").lower()]
    if not matches:
        return {"matches": [], "highlights": [], "total_highlights": 0}

    ids = [p["_id"] for p in matches]
    highlights = [
        h async for h in db.highlights.find(
            {"event_id": event["_id"], "people_ids": {"$in": ids}}
        ).sort("timestamp", 1)
    ]
    return {
        "matches": [
            {"id": p["_id"], "name": p.get("name"), "role": p.get("role"),
             "confidence": p.get("confidence", 90)}
            for p in matches
        ],
        "highlights": [
            {"id": h["_id"], "timestamp": h.get("timestamp", 0), "moment_type": h.get("moment_type"),
             "score": h.get("score", 0), "duration": h.get("duration", 8)}
            for h in highlights
        ],
        "total_highlights": len(highlights),
    }
