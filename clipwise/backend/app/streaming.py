"""HTTP range-request video serving.

When storage can hand out a signed URL (S3, Cloudinary) we redirect and let the
CDN handle ranges. For local files we implement 206 Partial Content ourselves so
seeking works in every browser.
"""
from __future__ import annotations

import os
import re
from typing import Optional

from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse, StreamingResponse

from .storage import get_storage

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")
CHUNK = 1024 * 512


def _iter_file(path: str, start: int, end: int):
    with open(path, "rb") as fh:
        fh.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = fh.read(min(CHUNK, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


def serve_media(
    request: Request,
    key: str,
    *,
    content_type: str = "video/mp4",
    download_name: Optional[str] = None,
):
    storage = get_storage()
    signed = storage.url(key, download_name=download_name)
    if signed:
        return RedirectResponse(signed, status_code=302)

    path = storage.local_path(key)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Media not found in storage.")

    file_size = os.path.getsize(path)
    range_header = request.headers.get("range") or request.headers.get("Range")
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
    }
    if download_name:
        headers["Content-Disposition"] = f'attachment; filename="{download_name}"'

    if not range_header:
        headers["Content-Length"] = str(file_size)
        return StreamingResponse(
            _iter_file(path, 0, file_size - 1),
            media_type=content_type,
            headers=headers,
        )

    match = RANGE_RE.match(range_header.strip())
    if not match:
        raise HTTPException(status_code=416, detail="Malformed Range header")
    raw_start, raw_end = match.groups()
    if raw_start == "":
        # suffix range: last N bytes
        length = int(raw_end or 0)
        start = max(0, file_size - length)
        end = file_size - 1
    else:
        start = int(raw_start)
        end = int(raw_end) if raw_end else file_size - 1
    end = min(end, file_size - 1)
    if start > end or start >= file_size:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable",
                            headers={"Content-Range": f"bytes */{file_size}"})

    headers.update({
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(end - start + 1),
    })
    return StreamingResponse(
        _iter_file(path, start, end),
        status_code=206,
        media_type=content_type,
        headers=headers,
    )
