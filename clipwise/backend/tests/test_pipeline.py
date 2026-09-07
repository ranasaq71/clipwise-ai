"""End-to-end background pipeline with TwelveLabs stubbed at the network edge."""
import os
import subprocess
import uuid

import mongomock
import pytest

import app.db as dbmod
from app import tasks
from app.storage import get_storage


@pytest.fixture
def sync_db(monkeypatch):
    dbmod._sync_client = mongomock.MongoClient()
    yield dbmod.get_sync_db()
    dbmod._sync_client = None


@pytest.fixture
def raw_video(tmp_path):
    out = tmp_path / "raw.mkv"
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=15",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=15",
         "-c:v", "mpeg4", "-c:a", "libmp3lame", "-shortest", str(out)],
        capture_output=True, check=True,
    )
    return str(out)


FAKE_HIGHLIGHTS = [
    {"timestamp": 1.0, "duration": 3.0, "moment_type": "Opening", "description": "d1", "score": 90,
     "people_names": ["Ada"]},
    {"timestamp": 6.0, "duration": 3.0, "moment_type": "Middle", "description": "d2", "score": 75,
     "people_names": []},
    {"timestamp": 11.0, "duration": 3.0, "moment_type": "Close", "description": "d3", "score": 82,
     "people_names": []},
]


def stub_twelvelabs(monkeypatch, highlights=FAKE_HIGHLIGHTS):
    monkeypatch.setattr(tasks.tl, "upload_asset", lambda path, filename=None: "asset-123")
    monkeypatch.setattr(tasks.tl, "ensure_index", lambda existing=None, name=None: "index-123")
    monkeypatch.setattr(tasks.tl, "index_video", lambda *a, **kw: "video-123")
    monkeypatch.setattr(tasks.tl, "detect_highlights", lambda **kw: highlights)


def seed_event(db, raw_video):
    storage = get_storage()
    event_id = str(uuid.uuid4())
    key = f"events/{event_id}/raw.mkv"
    storage.put(key, raw_video, "video/x-matroska")
    db.events.insert_one({
        "_id": event_id, "owner_id": "u1", "title": "Pipeline Test", "event_type": "wedding",
        "status": "processing", "raw_key": key, "highlight_preferences": ["emotional"],
    })
    db.users.insert_one({"_id": "u1", "email": "pipeline@example.com", "name": "Pipeline"})
    return event_id


def test_process_event_end_to_end(sync_db, raw_video, monkeypatch):
    stub_twelvelabs(monkeypatch)
    event_id = seed_event(sync_db, raw_video)

    tasks.process_event_task.run(event_id)

    event = sync_db.events.find_one({"_id": event_id})
    assert event["status"] == "ready", event.get("message")
    assert event["progress"] == 100
    assert event["video_key"].endswith("master.mp4")
    assert event["twelvelabs_video_id"] == "video-123"
    assert 14 < event["duration_seconds"] < 16

    stored = get_storage()
    assert stored.exists(event["video_key"])
    assert stored.exists(event["thumbnail_key"])

    highlights = list(sync_db.highlights.find({"event_id": event_id}))
    assert len(highlights) == 3
    assert [h["moment_type"] for h in sorted(highlights, key=lambda x: x["timestamp"])] == \
        ["Opening", "Middle", "Close"]


def test_reel_generation_produces_a_playable_mp4(sync_db, raw_video, monkeypatch, tmp_path):
    stub_twelvelabs(monkeypatch)
    event_id = seed_event(sync_db, raw_video)
    tasks.process_event_task.run(event_id)

    tasks.generate_reel_task.run(event_id, False, 3)

    reel = sync_db.reels.find_one({"_id": event_id})
    assert reel["status"] == "ready", reel.get("message")
    assert reel["clip_count"] == 3

    local = get_storage().download(reel["key"], str(tmp_path / "reel.mp4"))
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-show_entries", "stream=codec_name", "-of", "csv=p=0", local],
        capture_output=True, text=True, check=True,
    ).stdout
    assert "h264" in out and "aac" in out


def test_vertical_reel(sync_db, raw_video, monkeypatch, tmp_path):
    stub_twelvelabs(monkeypatch)
    event_id = seed_event(sync_db, raw_video)
    tasks.process_event_task.run(event_id)

    tasks.generate_reel_task.run(event_id, True, 2)
    reel = sync_db.reels.find_one({"_id": event_id})
    assert reel["status"] == "ready", reel.get("message")
    assert reel["key"].endswith("reel_vertical.mp4")

    local = get_storage().download(reel["key"], str(tmp_path / "v.mp4"))
    dims = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", local],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    assert dims.startswith("1080,1920")


def test_twelvelabs_failure_surfaces_instead_of_mocking(sync_db, raw_video, monkeypatch):
    stub_twelvelabs(monkeypatch)

    def boom(**kw):
        raise tasks.tl.TwelveLabsError("Pegasus returned no usable highlights for this video.")

    monkeypatch.setattr(tasks.tl, "detect_highlights", boom)
    event_id = seed_event(sync_db, raw_video)

    tasks.process_event_task.run(event_id)

    event = sync_db.events.find_one({"_id": event_id})
    assert event["status"] == "error"
    assert "Pegasus" in event["error_message"]
    assert sync_db.highlights.count_documents({"event_id": event_id}) == 0


def test_reel_without_highlights_reports_a_real_error(sync_db, raw_video, monkeypatch):
    stub_twelvelabs(monkeypatch, highlights=[])
    event_id = seed_event(sync_db, raw_video)
    sync_db.events.update_one({"_id": event_id}, {"$set": {"video_key": None}})

    tasks.generate_reel_task.run(event_id, False, 5)
    reel = sync_db.reels.find_one({"_id": event_id})
    assert reel["status"] == "error"
    assert "master" in reel["message"]


def test_social_clip_task(sync_db, raw_video, monkeypatch):
    stub_twelvelabs(monkeypatch)
    event_id = seed_event(sync_db, raw_video)
    tasks.process_event_task.run(event_id)

    highlight = sync_db.highlights.find_one({"event_id": event_id})
    clip_id = str(uuid.uuid4())
    sync_db.clips.insert_one({
        "_id": clip_id, "event_id": event_id, "highlight_id": highlight["_id"],
        "format": "tiktok", "aspect": "9:16", "status": "processing",
    })

    tasks.generate_clip_task.run(event_id, clip_id)
    clip = sync_db.clips.find_one({"_id": clip_id})
    assert clip["status"] == "ready", clip.get("message")
    assert get_storage().exists(clip["key"])
