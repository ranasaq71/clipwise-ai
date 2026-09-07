"""Mongo access.

The API is async (motor); Celery workers are sync (pymongo). Both talk to the
same database, and job progress is written to Mongo so the SSE endpoint in the
API process can stream it regardless of which process is doing the work.
"""
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient

from .config import settings

_async_client: Optional[AsyncIOMotorClient] = None
_sync_client: Optional[MongoClient] = None


def get_db() -> AsyncIOMotorDatabase:
    global _async_client
    if _async_client is None:
        _async_client = AsyncIOMotorClient(settings.mongo_url, uuidRepresentation="standard")
    return _async_client[settings.mongo_db]


def get_sync_db():
    global _sync_client
    if _sync_client is None:
        _sync_client = MongoClient(settings.mongo_url, uuidRepresentation="standard")
    return _sync_client[settings.mongo_db]


async def ensure_indexes() -> None:
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.events.create_index([("owner_id", 1), ("created_at", -1)])
    await db.events.create_index("status")
    await db.highlights.create_index([("event_id", 1), ("score", -1)])
    await db.people.create_index([("event_id", 1)])
    await db.appearances.create_index([("event_id", 1), ("person_id", 1)])
    await db.clips.create_index([("event_id", 1), ("created_at", -1)])
    await db.products.create_index([("event_id", 1)])
    await db.uploads.create_index("upload_id")
    await db.payments.create_index("session_id")
