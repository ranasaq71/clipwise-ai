"""Named-person enrollment and appearance tracking.

Face detection and descriptor extraction happen in the browser; this router
stores the resulting descriptors per event, matches names, and keeps the
appearance timeline that drives "find me" search and timeline tagging.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..models import AppearanceBatch, DescriptorAdd, PersonCreate
from ..security import current_user
from .deps import get_event, person_out
from .events import PLAN_LIMITS

router = APIRouter(prefix="/events", tags=["faces"])


def _now():
    return datetime.now(timezone.utc)


async def _appearance_counts(event_id: str) -> dict:
    pipeline = [{"$match": {"event_id": event_id}}, {"$group": {"_id": "$person_id", "n": {"$sum": 1}}}]
    return {d["_id"]: d["n"] async for d in get_db().appearances.aggregate(pipeline)}


@router.get("/{event_id}/people")
async def list_people(event_id: str, user=Depends(current_user)):
    await get_event(event_id, user)
    counts = await _appearance_counts(event_id)
    cursor = get_db().people.find({"event_id": event_id}).sort("created_at", 1)
    return [person_out(p, counts.get(p["_id"], 0)) async for p in cursor]


@router.post("/{event_id}/people", status_code=201)
async def create_person(event_id: str, payload: PersonCreate, user=Depends(current_user)):
    await get_event(event_id, user)
    db = get_db()

    limit = PLAN_LIMITS.get(user.get("plan", "starter"), PLAN_LIMITS["starter"])["people"]
    if limit is not None:
        count = await db.people.count_documents({"event_id": event_id})
        if count >= limit:
            raise HTTPException(
                status_code=402,
                detail=f"Your {user.get('plan', 'starter')} plan allows {limit} named people per event.",
            )

    existing = await db.people.find_one({"event_id": event_id, "name": payload.name.strip()})
    if existing:
        raise HTTPException(status_code=409, detail=f"{payload.name} is already enrolled for this event.")

    person = {
        "_id": str(uuid.uuid4()),
        "event_id": event_id,
        "name": payload.name.strip(),
        "role": (payload.role or "").strip() or None,
        "photos": payload.photos[:10],
        "descriptors": payload.descriptors[:10],
        "confidence": _confidence(len(payload.descriptors)),
        "source": "face",
        "created_at": _now(),
    }
    await db.people.insert_one(person)
    return person_out(person)


@router.post("/{event_id}/people/{person_id}/descriptors")
async def add_descriptor(event_id: str, person_id: str, payload: DescriptorAdd, user=Depends(current_user)):
    await get_event(event_id, user)
    db = get_db()
    person = await db.people.find_one({"_id": person_id, "event_id": event_id})
    if not person:
        raise HTTPException(status_code=404, detail="Person not found.")
    descriptors = (person.get("descriptors") or [])[:9] + [payload.descriptor]
    photos = person.get("photos") or []
    if payload.photo and len(photos) < 10:
        photos = photos + [payload.photo]
    await db.people.update_one(
        {"_id": person_id},
        {"$set": {"descriptors": descriptors, "photos": photos,
                  "confidence": _confidence(len(descriptors)), "updated_at": _now()}},
    )
    counts = await _appearance_counts(event_id)
    return person_out(await db.people.find_one({"_id": person_id}), counts.get(person_id, 0))


@router.delete("/{event_id}/people/{person_id}", status_code=204)
async def delete_person(event_id: str, person_id: str, user=Depends(current_user)):
    await get_event(event_id, user)
    db = get_db()
    await db.people.delete_one({"_id": person_id, "event_id": event_id})
    await db.appearances.delete_many({"event_id": event_id, "person_id": person_id})
    await db.highlights.update_many({"event_id": event_id}, {"$pull": {"people_ids": person_id}})
    return None


@router.get("/{event_id}/appearances")
async def list_appearances(event_id: str, user=Depends(current_user)):
    await get_event(event_id, user)
    cursor = get_db().appearances.find({"event_id": event_id}).sort("timestamp", 1)
    return [
        {"id": str(a["_id"]), "person_id": a["person_id"], "timestamp": a["timestamp"],
         "confidence": a.get("confidence", 90)}
        async for a in cursor
    ]


@router.post("/{event_id}/appearances")
async def record_appearances(event_id: str, payload: AppearanceBatch, user=Depends(current_user)):
    """Replace the appearance set produced by a browser-side scan."""
    await get_event(event_id, user)
    db = get_db()
    people = {p["name"].lower(): p for p in [x async for x in db.people.find({"event_id": event_id})]}
    by_id = {p["_id"]: p for p in people.values()}

    docs = []
    for item in payload.items:
        person_id = item.person_id
        if not person_id and item.name:
            person = people.get(item.name.strip().lower())
            person_id = person["_id"] if person else None
        if not person_id or (person_id not in by_id):
            continue
        docs.append({
            "_id": str(uuid.uuid4()),
            "event_id": event_id,
            "person_id": person_id,
            "timestamp": round(float(item.timestamp), 2),
            "confidence": max(0, min(100, int(item.confidence))),
            "created_at": _now(),
        })

    if docs:
        # A scan is authoritative for the people it covers.
        scanned = list({d["person_id"] for d in docs})
        await db.appearances.delete_many({"event_id": event_id, "person_id": {"$in": scanned}})
        await db.appearances.insert_many(docs)
        await _tag_highlights(event_id)

    cursor = db.appearances.find({"event_id": event_id}).sort("timestamp", 1)
    return [
        {"id": str(a["_id"]), "person_id": a["person_id"], "timestamp": a["timestamp"],
         "confidence": a.get("confidence", 90)}
        async for a in cursor
    ]


async def _tag_highlights(event_id: str) -> None:
    """Attach person ids to any highlight whose window contains an appearance."""
    db = get_db()
    appearances = [a async for a in db.appearances.find({"event_id": event_id})]
    async for h in db.highlights.find({"event_id": event_id}):
        start = h.get("timestamp", 0) - 3
        end = h.get("timestamp", 0) + h.get("duration", 8) + 3
        ids = sorted({a["person_id"] for a in appearances if start <= a["timestamp"] <= end})
        if ids != h.get("people_ids", []):
            await db.highlights.update_one({"_id": h["_id"]}, {"$set": {"people_ids": ids}})


def _confidence(n_descriptors: int) -> int:
    """More reference faces, more confidence — mirrors the marketing claim of 94%+ at 3+."""
    return {0: 60, 1: 78, 2: 88}.get(n_descriptors, min(97, 90 + n_descriptors))
