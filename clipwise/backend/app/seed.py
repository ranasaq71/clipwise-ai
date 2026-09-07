"""Startup seeding: the demo studio account and its sample event.

This is explicit seed data for the marketing demo — it is clearly marked with
`is_demo` and is never used as a fallback when a real AI call fails.
"""
from __future__ import annotations

import logging
import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone

from .config import settings
from .db import get_db
from .security import hash_password

log = logging.getLogger("clipwise.seed")

ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
DEMO_VIDEO = os.path.join(ASSET_DIR, "demo_video.mp4")

DEMO_PEOPLE = [
    ("Sarah Chen", "Bride", 93, "https://images.unsplash.com/photo-1758598304332-94b40ce7c7b4?w=400"),
    ("Marcus Rivera", "Groom", 90, "https://images.unsplash.com/photo-1769636930451-e8df6d839e4d?w=400"),
    ("Elena Chen", "Mother of Bride", 93, "https://images.unsplash.com/photo-1609371497456-3a55a205d5eb?w=400"),
    ("David Rivera", "Father of Groom", 90, "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400"),
]

# (timestamp seconds, duration, moment type, description, score, person indexes)
DEMO_HIGHLIGHTS = [
    (620, 12, "Getting ready", "Sarah laughs with her bridesmaids while the veil is pinned.", 82, [0, 2]),
    (1840, 14, "First look", "Marcus turns around and freezes; Sarah steps into frame.", 96, [0, 1]),
    (3120, 10, "Processional", "Elena walks Sarah down the aisle to live strings.", 88, [0, 2]),
    (3980, 18, "Vows", "Sarah's voice breaks halfway through her vows.", 98, [0, 1]),
    (4460, 8, "Ring exchange", "Close on hands; the ring catches the afternoon light.", 91, [0, 1]),
    (4680, 9, "First kiss", "The room stands. Confetti from the back row.", 97, [0, 1]),
    (5900, 11, "Family portraits", "David rearranges the group and everyone laughs.", 74, [1, 3]),
    (7380, 16, "Father's speech", "David toasts the couple and needs a moment.", 94, [1, 3]),
    (8020, 15, "Maid of honour toast", "A story about the first date lands perfectly.", 89, [0]),
    (9240, 20, "First dance", "Slow spin under warm string lights.", 95, [0, 1]),
    (10120, 12, "Parent dance", "Elena and Sarah, foreheads together.", 92, [0, 2]),
    (11500, 10, "Cake cutting", "Marcus goes for the nose. Sarah retaliates.", 79, [0, 1]),
    (13200, 14, "Sparkler exit", "The couple runs the tunnel; sparks everywhere.", 93, [0, 1]),
]


def _now():
    return datetime.now(timezone.utc)


def ensure_demo_video() -> bool:
    """Generate a small synthetic clip so the player has something to show."""
    if os.path.exists(DEMO_VIDEO):
        return True
    os.makedirs(ASSET_DIR, exist_ok=True)
    try:
        subprocess.run(
            [
                settings.ffmpeg_path, "-y",
                "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=30",
                "-f", "lavfi", "-i", "sine=frequency=220:duration=30",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart",
                DEMO_VIDEO,
            ],
            capture_output=True, check=True, timeout=300,
        )
        log.info("generated demo video at %s", DEMO_VIDEO)
        return True
    except Exception as exc:  # ffmpeg missing in this image, etc.
        log.warning("could not generate the demo video: %s", exc)
        return False


async def seed_demo() -> None:
    if not settings.seed_demo:
        return
    db = get_db()

    user = await db.users.find_one({"email": settings.demo_email})
    if not user:
        user = {
            "_id": str(uuid.uuid4()),
            "name": "ClipWise Demo Studio",
            "email": settings.demo_email,
            "password_hash": hash_password(settings.demo_password),
            "role": "admin",
            "plan": "agency",
            "event_credits": 0,
            "created_at": _now(),
        }
        await db.users.insert_one(user)
        log.info("seeded demo account %s", settings.demo_email)

    if await db.events.find_one({"is_demo": True}):
        return

    event_id = str(uuid.uuid4())
    await db.events.insert_one({
        "_id": event_id,
        "owner_id": user["_id"],
        "title": "Sarah & Marcus — Vineyard Wedding",
        "event_type": "wedding",
        "event_date": (_now() - timedelta(days=21)).date().isoformat(),
        "status": "ready",
        "stage": "finalize",
        "progress": 100,
        "message": f"{len(DEMO_HIGHLIGHTS)} highlights detected",
        "step": 5,
        "duration_min": 240,
        "duration_seconds": 240 * 60,
        "studio_name": "Golden Hour Co.",
        "brand_color": "#FFB000",
        "highlight_preferences": ["emotional", "speeches", "music", "detail"],
        "is_demo": True,
        "created_at": _now() - timedelta(days=20),
        "updated_at": _now(),
    })

    people_ids = []
    for name, role, confidence, photo in DEMO_PEOPLE:
        pid = str(uuid.uuid4())
        people_ids.append(pid)
        await db.people.insert_one({
            "_id": pid,
            "event_id": event_id,
            "name": name,
            "role": role,
            "photos": [photo],
            "descriptors": [],
            "confidence": confidence,
            "source": "demo",
            "created_at": _now(),
        })

    highlights = []
    appearances = []
    for ts, dur, moment, description, score, idxs in DEMO_HIGHLIGHTS:
        hid = str(uuid.uuid4())
        ids = [people_ids[i] for i in idxs]
        highlights.append({
            "_id": hid,
            "event_id": event_id,
            "timestamp": ts,
            "duration": dur,
            "moment_type": moment,
            "description": description,
            "score": score,
            "people_ids": ids,
            "people_names": [DEMO_PEOPLE[i][0] for i in idxs],
            "source": "demo",
            "created_at": _now(),
        })
        for pid in ids:
            appearances.append({
                "_id": str(uuid.uuid4()),
                "event_id": event_id,
                "person_id": pid,
                "timestamp": ts + 1,
                "confidence": 93,
                "created_at": _now(),
            })
    await db.highlights.insert_many(highlights)
    await db.appearances.insert_many(appearances)

    await db.products.insert_many([
        {"_id": str(uuid.uuid4()), "event_id": event_id, "name": "Ivory silk gown",
         "category": "Bridal", "estimated_value_usd": 3200, "appearances": 41, "confidence": 94,
         "approved": True, "matched_person_id": people_ids[0]},
        {"_id": str(uuid.uuid4()), "event_id": event_id, "name": "Midnight three-piece suit",
         "category": "Menswear", "estimated_value_usd": 1450, "appearances": 33, "confidence": 89,
         "approved": True, "matched_person_id": people_ids[1]},
        {"_id": str(uuid.uuid4()), "event_id": event_id, "name": "Pearl drop earrings",
         "category": "Jewellery", "estimated_value_usd": 480, "appearances": 12, "confidence": 76,
         "approved": False, "matched_person_id": people_ids[0]},
    ])

    log.info("seeded demo event %s with %d highlights", event_id, len(highlights))
