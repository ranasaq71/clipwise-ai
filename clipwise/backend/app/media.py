"""ffmpeg / ffprobe helpers.

Everything we hand to a browser is H.264 + AAC in an MP4 with the moov atom at
the front (`-movflags +faststart`), so playback and seeking start immediately.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from typing import List, Optional, Sequence

from .config import settings

log = logging.getLogger("clipwise.media")


class MediaError(RuntimeError):
    pass


@dataclass
class Probe:
    duration: float
    width: int
    height: int
    video_codec: str
    audio_codec: Optional[str]
    bitrate: int


def _run(cmd: Sequence[str], timeout: int = 3600) -> str:
    log.info("run: %s", " ".join(cmd[:12]))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-12:]
        raise MediaError("\n".join(tail) or f"{cmd[0]} exited {proc.returncode}")
    return proc.stdout


def probe(path: str) -> Probe:
    out = _run([
        settings.ffprobe_path, "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ], timeout=300)
    data = json.loads(out)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not video:
        raise MediaError("No video stream found in the uploaded file.")
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    return Probe(
        duration=duration,
        width=int(video.get("width") or 0),
        height=int(video.get("height") or 0),
        video_codec=video.get("codec_name") or "",
        audio_codec=audio.get("codec_name") if audio else None,
        bitrate=int(data.get("format", {}).get("bit_rate") or 0),
    )


def transcode_to_mp4(src: str, dest: str, max_height: int = 1080) -> str:
    """Normalise anything to a faststart H.264/AAC MP4."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    _run([
        settings.ffmpeg_path, "-y", "-i", src,
        "-vf", f"scale=-2:'min({max_height},ih)'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-movflags", "+faststart",
        dest,
    ])
    return dest


def thumbnail(src: str, dest: str, at: float = 3.0) -> str:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    _run([
        settings.ffmpeg_path, "-y", "-ss", str(max(0.0, at)), "-i", src,
        "-frames:v", "1", "-vf", "scale=640:-2", dest,
    ], timeout=300)
    return dest


def cut_segment(src: str, dest: str, start: float, duration: float, vertical: bool = False) -> str:
    """Cut one segment, re-encoding so every piece is concat-compatible."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    vf = "scale=-2:1080,setsar=1"
    if vertical:
        # Centre-crop to 9:16 for TikTok / Reels / Shorts.
        # Commas inside filter expressions must be escaped or ffmpeg splits the graph.
        vf = (
            "crop='min(iw\\,ih*9/16)':'ih':'(iw-min(iw\\,ih*9/16))/2':0,"
            "scale=1080:1920,setsar=1"
        )
    _run([
        settings.ffmpeg_path, "-y",
        "-ss", f"{max(0.0, start):.3f}", "-i", src, "-t", f"{max(0.5, duration):.3f}",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart",
        dest,
    ])
    return dest


def concat(parts: List[str], dest: str) -> str:
    """Concatenate pre-normalised MP4 parts into one faststart MP4."""
    if not parts:
        raise MediaError("Nothing to concatenate — no highlight segments were produced.")
    if len(parts) == 1:
        _run([settings.ffmpeg_path, "-y", "-i", parts[0], "-c", "copy", "-movflags", "+faststart", dest])
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
        for p in parts:
            fh.write(f"file '{os.path.abspath(p)}'\n")
        listfile = fh.name
    try:
        _run([
            settings.ffmpeg_path, "-y", "-f", "concat", "-safe", "0", "-i", listfile,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart",
            dest,
        ])
    finally:
        os.unlink(listfile)
    return dest


def workdir(*parts: str) -> str:
    p = os.path.join(settings.work_dir, *parts)
    os.makedirs(p, exist_ok=True)
    return p
