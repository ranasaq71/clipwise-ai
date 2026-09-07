"""Exercises the real ffmpeg pipeline: probe → transcode → cut → concat."""
import json
import os
import subprocess

import pytest

from app import media


@pytest.fixture(scope="module")
def source(tmp_path_factory):
    """A 12s 640x360 clip in a deliberately awkward codec/container."""
    out = tmp_path_factory.mktemp("src") / "source.mkv"
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=12",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=12",
         "-c:v", "mpeg4", "-c:a", "libmp3lame", "-shortest", str(out)],
        capture_output=True, check=True,
    )
    return str(out)


def ffprobe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


def test_probe_reads_the_source(source):
    p = media.probe(source)
    assert 11.5 < p.duration < 12.5
    assert (p.width, p.height) == (640, 360)


def test_transcode_produces_faststart_h264_aac(source, tmp_path):
    dest = str(tmp_path / "master.mp4")
    media.transcode_to_mp4(source, dest)
    info = ffprobe(dest)
    codecs = {s["codec_type"]: s["codec_name"] for s in info["streams"]}
    assert codecs["video"] == "h264"
    assert codecs["audio"] == "aac"
    # moov before mdat == faststart
    with open(dest, "rb") as fh:
        head = fh.read(200_000)
    assert head.index(b"moov") < head.index(b"mdat")


def test_cut_and_concat_builds_a_reel(source, tmp_path):
    master = str(tmp_path / "master.mp4")
    media.transcode_to_mp4(source, master)

    parts = []
    for i, (start, dur) in enumerate([(0.5, 2.0), (5.0, 2.0), (9.0, 2.0)]):
        p = str(tmp_path / f"part{i}.mp4")
        media.cut_segment(master, p, start, dur)
        parts.append(p)

    reel = str(tmp_path / "reel.mp4")
    media.concat(parts, reel)
    info = ffprobe(reel)
    duration = float(info["format"]["duration"])
    assert 5.0 < duration < 7.5  # ~6s of content
    assert {s["codec_name"] for s in info["streams"] if s["codec_type"] == "video"} == {"h264"}


def test_vertical_export_is_nine_by_sixteen(source, tmp_path):
    master = str(tmp_path / "master.mp4")
    media.transcode_to_mp4(source, master)
    out = str(tmp_path / "vertical.mp4")
    media.cut_segment(master, out, 1.0, 2.0, vertical=True)
    video = next(s for s in ffprobe(out)["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"]) == (1080, 1920)


def test_concat_with_no_parts_raises(tmp_path):
    with pytest.raises(media.MediaError):
        media.concat([], str(tmp_path / "x.mp4"))


def test_probe_rejects_a_non_video(tmp_path):
    junk = tmp_path / "junk.mp4"
    junk.write_bytes(os.urandom(4096))
    with pytest.raises(media.MediaError):
        media.probe(str(junk))
