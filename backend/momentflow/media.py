"""Media validation and source-time segment planning."""

import hashlib
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".m4v", ".avi"}


def load_image(path):
    with Image.open(path) as image:
        if image.width * image.height > 40_000_000:
            raise ValueError("照片过大：最多 4000 万像素。")
        image = ImageOps.exif_transpose(image).convert("RGB")
        return cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)


def probe(path):
    path = Path(path)
    if path.suffix.lower() in IMAGE_EXTENSIONS:
        frame = load_image(path)
        return {"kind": "image", "duration": 0, "width": frame.shape[1], "height": frame.shape[0]}
    if path.suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError("仅支持 JPG、PNG、WebP 及 MP4/MOV/WebM/M4V/AVI 视频。")
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        capture_output=True,
        timeout=20,
        check=True,
    )
    data = json.loads(result.stdout)
    video = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    seconds = float(data.get("format", {}).get("duration", 0))
    if not video or not 0 < seconds <= 300:
        raise ValueError("视频需可解码且时长不超过 5 分钟。")
    if video["width"] * video["height"] > 3840 * 2160:
        raise ValueError("当前本地版本支持最高 4K 视频。")
    cap = cv2.VideoCapture(str(path))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise ValueError("无法解码视频，请转为 H.264 MP4 后重试。")
    return {
        "kind": "video",
        "duration": seconds,
        "width": frame.shape[1],
        "height": frame.shape[0],
        "has_audio": any(s["codec_type"] == "audio" for s in data["streams"]),
    }


def sample_frames(media, interval):
    if media["kind"] == "image":
        yield 0.0, load_image(media["path"])
        return
    cap = cv2.VideoCapture(media["path"])
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        frame_index, next_sample = 0, 0.0
        while True:
            ok, frame = cap.read()
            if not ok:
                if frame_index == 0:
                    raise ValueError("视频首帧无法解码")
                break
            actual = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if actual <= 0 and frame_index > 0:
                actual = frame_index / fps
            frame_index += 1
            if actual + 0.0001 < next_sample:
                continue
            yield round(actual, 3), frame
            next_sample = actual + interval
    finally:
        cap.release()


def segments_for(project, person):
    members = {fid for fid in person["face_ids"]}
    result = []
    interval = project["sample_interval"]
    for media in project["media"]:
        faces = [
            f
            for f in project["faces"]
            if f["id"] in members and f["media_id"] == media["id"] and not f.get("reference")
        ]
        if not faces:
            continue
        if media["kind"] == "image":
            spans = [[0.0, 3.0]]
        else:
            spans = []
            # Never bridge an unobserved interval beyond the configured sampling gap.
            for timestamp in sorted({f["timestamp"] for f in faces}):
                start = max(0.0, timestamp - interval * 0.45)
                end = min(media["duration"], timestamp + interval * 0.55)
                if spans and start <= spans[-1][1] + 0.05:
                    spans[-1][1] = end
                else:
                    spans.append([start, end])
            spans = [
                [start + offset, min(end, start + offset + 5)]
                for start, end in spans
                for offset in np.arange(0, end - start, 5)
                if min(end, start + offset + 5) - (start + offset) >= 0.35
            ]
        for start, end in spans:
            key = f"{person['id']}:{media['id']}:{start:.3f}:{end:.3f}"
            result.append(
                {
                    "id": hashlib.sha256(key.encode()).hexdigest()[:20],
                    "media_id": media["id"],
                    "name": media["name"],
                    "kind": media["kind"],
                    "start": round(float(start), 3),
                    "end": round(float(end), 3),
                    "duration": round(float(end - start), 3),
                    "quality": round(max(f["confidence"] for f in faces), 3),
                    "other_faces": len(
                        {
                            f["id"]
                            for f in project["faces"]
                            if f["media_id"] == media["id"]
                            and f["id"] not in members
                            and not f.get("reference")
                        }
                    ),
                    "thumbnail": f"/api/projects/{project['id']}/media/{media['id']}/thumbnail",
                }
            )
    return result
