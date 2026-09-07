"""TwelveLabs integration.

Pegasus does highlight detection, Marengo does semantic search. Both run against
the real API — there is no mock path. If TWELVELABS_API_KEY is missing, or the
API returns an error, we raise TwelveLabsError and the caller surfaces it to the
UI rather than substituting placeholder data.
"""
from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
from typing import Any, Dict, List, Optional

from ..config import settings
from .profiles import HIGHLIGHT_SCHEMA, build_highlight_prompt

log = logging.getLogger("clipwise.twelvelabs")


class TwelveLabsError(RuntimeError):
    pass


class TwelveLabsNotConfigured(TwelveLabsError):
    def __init__(self):
        super().__init__(
            "TwelveLabs is not configured. Set TWELVELABS_API_KEY in the server environment "
            "to enable highlight detection and semantic search."
        )


def is_configured() -> bool:
    return bool(settings.twelvelabs_api_key)


def _client():
    if not is_configured():
        raise TwelveLabsNotConfigured()
    try:
        from twelvelabs import TwelveLabs
    except ImportError as exc:  # pragma: no cover
        raise TwelveLabsError(f"twelvelabs SDK is not installed: {exc}") from exc
    return TwelveLabs(api_key=settings.twelvelabs_api_key)


def _id_of(obj: Any) -> Optional[str]:
    for attr in ("id", "_id", "asset_id", "index_id", "video_id"):
        val = getattr(obj, attr, None)
        if isinstance(val, str):
            return val
    if isinstance(obj, dict):
        for key in ("id", "_id", "asset_id", "index_id", "video_id"):
            if isinstance(obj.get(key), str):
                return obj[key]
    return None


# --------------------------------------------------------------------------
# Assets
# --------------------------------------------------------------------------
def upload_asset(path: str, filename: Optional[str] = None) -> str:
    """Upload a video file as a TwelveLabs asset.

    The file tuple carries an explicit MIME type — sending the wrong content
    type is the classic cause of a silently rejected asset upload.
    """
    client = _client()
    name = filename or os.path.basename(path)
    content_type = mimetypes.guess_type(name)[0] or "video/mp4"
    if not content_type.startswith("video/"):
        content_type = "video/mp4"
    try:
        with open(path, "rb") as fh:
            asset = client.assets.create(
                method="direct",
                file=(name, fh, content_type),
                filename=name,
                enable_hls=True,
                enable_thumbnail=True,
            )
    except Exception as exc:
        raise TwelveLabsError(f"Asset upload failed: {exc}") from exc
    asset_id = _id_of(asset)
    if not asset_id:
        raise TwelveLabsError(f"Asset upload returned no id: {asset!r}")
    log.info("twelvelabs asset created: %s (%s)", asset_id, content_type)
    return asset_id


# --------------------------------------------------------------------------
# Indexes (Marengo, for semantic search)
# --------------------------------------------------------------------------
def ensure_index(existing_index_id: Optional[str] = None, name: Optional[str] = None) -> str:
    client = _client()
    index_name = name or settings.twelvelabs_index_name
    if existing_index_id:
        try:
            client.indexes.retrieve(existing_index_id)
            return existing_index_id
        except Exception:
            log.warning("stored index %s is gone, recreating", existing_index_id)
    try:
        for idx in client.indexes.list(index_name=index_name):
            found = _id_of(idx)
            if found:
                return found
    except Exception:
        pass
    try:
        created = client.indexes.create(
            index_name=index_name,
            models=[{
                "model_name": settings.twelvelabs_marengo_model,
                "model_options": ["visual", "audio"],
            }],
            addons=["thumbnail"],
        )
    except Exception as exc:
        raise TwelveLabsError(f"Could not create TwelveLabs index: {exc}") from exc
    index_id = _id_of(created)
    if not index_id:
        raise TwelveLabsError(f"Index creation returned no id: {created!r}")
    return index_id


def index_video(index_id: str, *, local_path: Optional[str] = None, video_url: Optional[str] = None,
                on_progress=None) -> str:
    """Index a video for Marengo search. Returns the TwelveLabs video_id."""
    client = _client()
    try:
        if video_url:
            task = client.tasks.create(index_id=index_id, video_url=video_url, enable_video_stream=True)
        elif local_path:
            name = os.path.basename(local_path)
            with open(local_path, "rb") as fh:
                task = client.tasks.create(
                    index_id=index_id,
                    video_file=(name, fh, "video/mp4"),
                    enable_video_stream=True,
                )
        else:
            raise TwelveLabsError("index_video needs either local_path or video_url")
    except TwelveLabsError:
        raise
    except Exception as exc:
        raise TwelveLabsError(f"Could not start indexing task: {exc}") from exc

    task_id = _id_of(task)
    if not task_id:
        raise TwelveLabsError(f"Indexing task returned no id: {task!r}")

    def _cb(t):
        if on_progress:
            on_progress(getattr(t, "status", "processing"))

    try:
        done = client.tasks.wait_for_done(task_id, sleep_interval=5.0, callback=_cb)
    except Exception as exc:
        raise TwelveLabsError(f"Indexing task failed: {exc}") from exc

    status = (getattr(done, "status", "") or "").lower()
    if status not in ("ready", "done", "completed"):
        raise TwelveLabsError(f"Indexing finished with status '{status}'")
    video_id = getattr(done, "video_id", None) or _id_of(done)
    if not video_id:
        raise TwelveLabsError("Indexing completed but no video_id was returned")
    return video_id


# --------------------------------------------------------------------------
# Pegasus — highlight detection
# --------------------------------------------------------------------------
def _extract_payload(response: Any) -> Dict[str, Any]:
    """Pull the JSON body out of whatever shape the SDK hands back."""
    for attr in ("data", "text", "content", "result", "output"):
        val = getattr(response, attr, None)
        if isinstance(val, dict):
            return val
        if isinstance(val, str) and val.strip():
            return _loads_loose(val)
    if isinstance(response, dict):
        for key in ("data", "text", "content", "result", "output"):
            val = response.get(key)
            if isinstance(val, dict):
                return val
            if isinstance(val, str) and val.strip():
                return _loads_loose(val)
        return response
    if isinstance(response, str):
        return _loads_loose(response)
    raise TwelveLabsError(f"Could not read the Pegasus response: {response!r}")


def _loads_loose(text: str) -> Dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        brace = re.search(r"\{.*\}", text, re.S)
        if brace:
            try:
                return json.loads(brace.group(0))
            except json.JSONDecodeError:
                pass
    raise TwelveLabsError(f"Pegasus returned text that is not valid JSON: {text[:400]}")


def detect_highlights(
    *,
    asset_id: Optional[str] = None,
    video_url: Optional[str] = None,
    event_type: str = "wedding",
    preferences: Optional[List[str]] = None,
    duration_seconds: float = 0,
) -> List[Dict[str, Any]]:
    """Run Pegasus over the video and return structured highlight moments."""
    client = _client()
    from twelvelabs.types.video_context import VideoContext_AssetId, VideoContext_Url
    from twelvelabs.types.sync_response_format import SyncResponseFormat

    if asset_id:
        video_ctx = VideoContext_AssetId(asset_id=asset_id)
    elif video_url:
        video_ctx = VideoContext_Url(url=video_url)
    else:
        raise TwelveLabsError("detect_highlights needs either asset_id or video_url")

    prompt = build_highlight_prompt(event_type, preferences, duration_seconds)
    try:
        response = client.analyze(
            model_name=settings.twelvelabs_pegasus_model,
            video=video_ctx,
            prompt=prompt,
            temperature=0.2,
            response_format=SyncResponseFormat(type="json_schema", json_schema=HIGHLIGHT_SCHEMA),
            request_options={"timeout_in_seconds": settings.twelvelabs_timeout},
        )
    except Exception as exc:
        raise TwelveLabsError(f"Pegasus analysis failed: {exc}") from exc

    payload = _extract_payload(response)
    raw = payload.get("highlights")
    if not isinstance(raw, list):
        raise TwelveLabsError(f"Pegasus response had no 'highlights' array: {str(payload)[:400]}")

    out: List[Dict[str, Any]] = []
    for item in raw:
        try:
            start = float(item.get("start_seconds", 0))
            dur = float(item.get("duration_seconds", 8))
        except (TypeError, ValueError):
            continue
        if duration_seconds and start >= duration_seconds:
            continue
        if duration_seconds:
            dur = min(dur, max(1.0, duration_seconds - start))
        out.append({
            "timestamp": round(max(0.0, start), 2),
            "duration": round(max(2.0, min(30.0, dur)), 2),
            "moment_type": (item.get("moment_type") or "Highlight").strip()[:80],
            "description": (item.get("description") or "").strip()[:500],
            "score": max(0, min(100, int(item.get("score") or 0))),
            "people_names": [str(p)[:80] for p in (item.get("people") or []) if p],
        })
    out.sort(key=lambda h: h["timestamp"])
    if not out:
        raise TwelveLabsError("Pegasus returned no usable highlights for this video.")
    return out


# --------------------------------------------------------------------------
# Marengo — semantic search
# --------------------------------------------------------------------------
def search(index_id: str, query: str, *, video_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    client = _client()
    try:
        result = client.search.query(
            index_id=index_id,
            query_text=query,
            search_options=["visual", "audio"],
            page_limit=min(50, limit),
        )
    except Exception as exc:
        raise TwelveLabsError(f"Marengo search failed: {exc}") from exc

    items: List[Dict[str, Any]] = []
    for item in result:
        vid = getattr(item, "video_id", None)
        if video_id and vid and vid != video_id:
            continue
        start = getattr(item, "start", None)
        end = getattr(item, "end", None)
        score = getattr(item, "score", None)
        rank = getattr(item, "rank", None)
        confidence = getattr(item, "confidence", None)
        items.append({
            "timestamp": round(float(start or 0), 2),
            "duration": round(max(1.0, float(end or 0) - float(start or 0)), 2),
            "match_score": _normalise_score(score, rank, confidence),
            "transcription": getattr(item, "transcription", None),
            "thumbnail_url": getattr(item, "thumbnail_url", None),
            "video_id": vid,
        })
        if len(items) >= limit:
            break
    return items


def _normalise_score(score, rank, confidence) -> int:
    if isinstance(confidence, str):
        return {"high": 92, "medium": 78, "low": 62}.get(confidence.lower(), 70)
    for val in (score, rank):
        if isinstance(val, (int, float)):
            v = float(val)
            if v <= 1.0:
                return int(round(v * 100))
            return int(min(100, round(v)))
    return 70
