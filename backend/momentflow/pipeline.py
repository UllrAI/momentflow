"""Background analysis and real source-video highlight rendering."""

import math
import shutil
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .faces import AMBIGUITY_MARGIN, MATCH_THRESHOLD, FaceEngine, cluster_faces, face_id, similarity
from .media import load_image, sample_frames, segments_for
from .store import revision


class Cancelled(Exception):
    pass


class Jobs:
    def __init__(self, store):
        self.store = store
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="momentflow")
        self.events = {}
        self.engine = None
        self.guard = threading.RLock()
        cv2.setNumThreads(2)

    def get_engine(self):
        with self.guard:
            if self.engine is None:
                self.engine = FaceEngine()
            return self.engine

    def start(self, project_id, kind, operation):
        with self.guard, self.store.lock:
            project = self.store.load(project_id)
            if project.get("job") and project["job"]["status"] == "running":
                raise ValueError("当前项目已有任务，请等待或取消。")
            event = threading.Event()
            job_id = str(uuid.uuid4())
            self.events[project_id] = event
            project["job"] = {
                "id": job_id,
                "kind": kind,
                "status": "running",
                "progress": 0,
                "stage": "任务已排队",
                "error": None,
            }
            self.store.save(project)
            self.pool.submit(self.run, project_id, job_id, event, operation)

    def run(self, project_id, job_id, event, operation):
        def check():
            if event.is_set():
                raise Cancelled()

        def progress(value, stage):
            check()

            def change(project):
                if project["job"]["id"] == job_id:
                    project["job"].update(progress=round(value), stage=stage)

            self.store.update(project_id, change)

        try:
            operation(self.store.load(project_id), check, progress)
            self.store.update(
                project_id, lambda p: p["job"].update(status="done", progress=100, stage="处理完成")
            )
        except Cancelled:
            self.store.update(
                project_id, lambda p: p["job"].update(status="cancelled", stage="已取消，可重试")
            )
        except Exception as error:  # noqa: BLE001 - persist errors at the job boundary
            message = str(error)[:500]
            self.store.update(
                project_id,
                lambda p: p["job"].update(status="failed", error=message, stage="处理失败，可重试"),
            )
        finally:
            with self.guard:
                if self.events.get(project_id) is event:
                    self.events.pop(project_id, None)

    def cancel(self, project_id):
        with self.guard:
            if project_id in self.events:
                self.events[project_id].set()

    def analyze(self, project, check, progress):
        engine = self.get_engine()
        pending = [m for m in project["media"] if m["status"] != "analyzed"]
        faces = list(project["faces"])
        directory = self.store.directory(project["id"])
        crops = directory / "crops"
        crops.mkdir(exist_ok=True)
        total = sum(max(1, math.ceil(m["duration"] / project["sample_interval"])) for m in pending)
        done = 0
        for media in pending:
            detections = 0
            samples = 0
            for timestamp, frame in sample_frames(media, project["sample_interval"]):
                check()
                for index, found in enumerate(engine.detect(frame)):
                    fid = face_id(media["id"], timestamp, index)
                    crop_path = crops / f"{fid}.jpg"
                    cv2.imwrite(str(crop_path), found.pop("crop"), [cv2.IMWRITE_JPEG_QUALITY, 88])
                    faces.append(
                        {
                            "id": fid,
                            "media_id": media["id"],
                            "timestamp": timestamp,
                            "crop_path": str(crop_path),
                            "reference": False,
                            **found,
                        }
                    )
                    detections += 1
                done += 1
                samples += 1
                progress(
                    min(92, done / max(total, 1) * 92),
                    f"检测与特征提取 · {media['name']} · {timestamp:.1f}s",
                )
            media.update(
                status="analyzed",
                detections=detections,
                sampled_frames=samples,
                warning="未检测到可用正面人脸，请人工检查原始素材。" if not detections else "",
            )
        check()
        people = cluster_faces(faces, project["people"])
        progress(96, "人物聚类与出镜片段整理")

        def commit(current):
            current["media"] = project["media"]
            current["faces"] = faces
            current["people"] = people
            current["analysis_version"] += 1

        check()
        self.store.update(project["id"], commit)

    def render(self, project, person_id, selected_ids, check, progress):
        engine = self.get_engine()
        person = next(p for p in project["people"] if p["id"] == person_id)
        catalog = {s["id"]: s for s in segments_for(project, person)}
        segments = [catalog[sid] for sid in selected_ids]
        media_by_id = {m["id"]: m for m in project["media"]}
        targets = [
            f["embedding"]
            for f in project["faces"]
            if f["id"] in person["face_ids"] and f.get("embedding")
        ]
        competitors = [
            f["embedding"]
            for f in project["faces"]
            if f["id"] not in person["face_ids"] and f.get("embedding")
        ]
        export_id = str(uuid.uuid4())
        outdir = self.store.directory(project["id"]) / "exports"
        outdir.mkdir(exist_ok=True)
        temp = outdir / export_id
        temp.mkdir()
        final = outdir / f"{export_id}.mp4"
        total_frames = sum(max(1, round(s["duration"] * 12)) for s in segments)
        rendered = 0
        font = get_font(25)
        footer = (
            f"{person['name']} · {'成长记录' if project['mode'] == 'kindergarten' else '专属集锦'}"
        )
        try:
            for index, segment in enumerate(segments):
                check()
                media = media_by_id[segment["media_id"]]
                frames = max(1, round(segment["duration"] * 12))
                target = temp / f"{index:03}.mp4"
                command = [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-f",
                    "rawvideo",
                    "-vcodec",
                    "rawvideo",
                    "-pix_fmt",
                    "bgr24",
                    "-s",
                    "1280x720",
                    "-r",
                    "12",
                    "-i",
                    "pipe:0",
                    "-an",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "22",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    str(target),
                ]
                error_path = temp / "ffmpeg.log"
                cap = None
                with error_path.open("wb") as log:
                    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
                    try:
                        if media["kind"] == "image":
                            raw = load_image(media["path"])
                            masked = mask_others(raw, engine, targets, competitors)
                            still = compose(masked, footer, font)
                        else:
                            cap = cv2.VideoCapture(media["path"])
                        for frame_index in range(frames):
                            check()
                            if media["kind"] == "video":
                                source_fps = cap.get(cv2.CAP_PROP_FPS) or 12
                                time = max(
                                    0.0,
                                    min(
                                        media["duration"] - 1 / source_fps,
                                        segment["end"] - 1 / source_fps,
                                        segment["start"] + frame_index / 12,
                                    ),
                                )
                                cap.set(cv2.CAP_PROP_POS_MSEC, time * 1000)
                                ok, raw = cap.read()
                                if not ok:
                                    raise ValueError(
                                        f"原视频 {media['name']} 在 {time:.2f}s 无法解码"
                                    )
                                # Re-detect on every exported frame; never reuse a stale face mask.
                                masked = mask_others(raw, engine, targets, competitors)
                                still = compose(masked, footer, font)
                            process.stdin.write(still.tobytes())
                            rendered += 1
                            if frame_index % 4 == 0:
                                progress(
                                    rendered / max(1, total_frames) * 93,
                                    f"原片剪辑与人脸遮盖 · 片段 {index + 1}/{len(segments)}",
                                )
                        process.stdin.close()
                        if process.wait(timeout=45) != 0:
                            raise RuntimeError(error_path.read_text()[-400:])
                    finally:
                        if cap is not None:
                            cap.release()
                        if process.poll() is None:
                            process.kill()
                            process.wait()
                        with suppress(Exception):
                            process.stdin.close()
            check()
            concat = temp / "segments.txt"
            concat.write_text("\n".join(f"file '{index:03}.mp4'" for index in range(len(segments))))
            progress(96, "合并个人纪念片")
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(concat),
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                    str(final),
                ],
                check=True,
                capture_output=True,
                timeout=60,
            )
            check()
            export = {
                "id": export_id,
                "person_id": person_id,
                "version": revision(project, person),
                "path": str(final),
                "segment_ids": selected_ids,
                "duration": rendered / 12,
                "width": 1280,
                "height": 720,
                "approved": False,
                "delivered": False,
                "muted": True,
                "note": person["note"],
            }
            self.store.update(project["id"], lambda p: p["exports"].append(export))
        except Exception:
            final.unlink(missing_ok=True)
            raise
        finally:
            shutil.rmtree(temp, ignore_errors=True)


def mask_others(frame, engine, targets, competitors):
    result = frame.copy()
    for found in engine.detect(frame, quality_gate=False):
        feature = found["embedding"]
        score = (
            max((similarity(feature, target) for target in targets), default=-1) if feature else -1
        )
        other = (
            max((similarity(feature, candidate) for candidate in competitors), default=-1)
            if feature
            else -1
        )
        if score >= MATCH_THRESHOLD and score - other >= AMBIGUITY_MARGIN:
            continue
        x, y, width, height = found["bbox"]
        pad = round(min(width, height) * 0.16)
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(frame.shape[1], x + width + pad), min(frame.shape[0], y + height + pad)
        roi = result[y0:y1, x0:x1]
        # Pixelation plus blur is obvious enough for teacher review at normal playback size.
        tiny = cv2.resize(roi, (5, 5), interpolation=cv2.INTER_AREA)
        result[y0:y1, x0:x1] = cv2.resize(tiny, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
    return result


def get_font(size):
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def compose(frame, caption, font):
    height, width = frame.shape[:2]
    scale = min(1280 / width, 640 / height)
    resized = cv2.resize(frame, (round(width * scale), round(height * scale)))
    result = np.full((720, 1280, 3), (239, 245, 246), dtype=np.uint8)
    x, y = (1280 - resized.shape[1]) // 2, (640 - resized.shape[0]) // 2
    result[y : y + resized.shape[0], x : x + resized.shape[1]] = resized
    image = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(image)
    draw.text((32, 664), caption, fill="#214c3c", font=font)
    draw.text((1030, 670), "MomentFlow", fill="#628574", font=get_font(18))
    return cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
