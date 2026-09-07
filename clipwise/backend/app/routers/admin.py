"""Studio-admin dashboard: every event, every client, and platform usage."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..db import get_db
from ..security import current_user, require_admin
from .deps import iso

router = APIRouter(tags=["admin"])


@router.get("/admin/overview")
async def overview(user=Depends(require_admin)):
    db = get_db()

    events = [e async for e in db.events.find().sort("created_at", -1).limit(300)]
    users = [u async for u in db.users.find().sort("created_at", -1).limit(300)]
    users_by_id = {u["_id"]: u for u in users}

    highlight_counts = {
        d["_id"]: d["n"]
        async for d in db.highlights.aggregate([{"$group": {"_id": "$event_id", "n": {"$sum": 1}}}])
    }
    event_counts: dict = {}
    for e in events:
        event_counts[e.get("owner_id")] = event_counts.get(e.get("owner_id"), 0) + 1

    storage_bytes = sum((e.get("video_size") or 0) + (e.get("raw_size") or 0) for e in events)

    return {
        "stats": {
            "events_total": len(events),
            "events_ready": sum(1 for e in events if e.get("status") == "ready"),
            "events_processing": sum(1 for e in events if e.get("status") == "processing"),
            "events_error": sum(1 for e in events if e.get("status") == "error"),
            "highlights_total": sum(highlight_counts.values()),
            "users_total": len(users),
            "storage_bytes": storage_bytes,
        },
        "events": [
            {
                "id": e["_id"],
                "title": e.get("title"),
                "event_type": e.get("event_type"),
                "status": e.get("status", "draft"),
                "error_message": e.get("error_message"),
                "highlight_count": highlight_counts.get(e["_id"], 0),
                "size_bytes": (e.get("video_size") or 0) + (e.get("raw_size") or 0),
                "owner_email": users_by_id.get(e.get("owner_id"), {}).get("email", "—"),
                "created_at": iso(e.get("created_at")),
            }
            for e in events
        ],
        "users": [
            {
                "id": u["_id"],
                "name": u.get("name"),
                "email": u.get("email"),
                "role": u.get("role", "admin"),
                "plan": u.get("plan", "starter"),
                "event_count": event_counts.get(u["_id"], 0),
                "created_at": iso(u.get("created_at")),
            }
            for u in users
        ],
    }


@router.get("/stats/overview")
async def studio_stats(user=Depends(current_user)):
    """Per-studio usage numbers for the dashboard cards."""
    db = get_db()
    events = [e async for e in db.events.find({"owner_id": user["_id"]})]
    ids = [e["_id"] for e in events]
    highlights = await db.highlights.count_documents({"event_id": {"$in": ids}}) if ids else 0
    people = await db.people.count_documents({"event_id": {"$in": ids}}) if ids else 0
    return {
        "events_total": len(events),
        "events_ready": sum(1 for e in events if e.get("status") == "ready"),
        "highlights_total": highlights,
        "people_total": people,
        "storage_bytes": sum((e.get("video_size") or 0) + (e.get("raw_size") or 0) for e in events),
        "hours_processed": round(sum(e.get("duration_seconds", 0) for e in events) / 3600, 1),
    }
