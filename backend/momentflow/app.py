"""Loopback API for real local media processing. Not a cloud identity service."""

import hashlib
import hmac
import os
import secrets
import shutil
import subprocess
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import cv2
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, SecretStr

from . import model_api
from .faces import cooccurs
from .media import (
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    load_image,
    probe,
    sample_frames,
    segments_for,
)
from .pipeline import Jobs
from .store import Store, current_story, export_current, public_view
from .story import Chapter

ROOT = Path(__file__).resolve().parents[2]
COOKIE = "momentflow_owner"


class CreateProject(BaseModel):
    mode: str = "adventure"
    title: str = Field(min_length=1, max_length=80)
    class_name: str = Field(default="", max_length=60)
    consent: bool = False


class PersonEdit(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    note: str = Field(default="", max_length=500)
    confirmed: bool = False
    authorized: bool = False


class RenderRequest(BaseModel):
    segment_ids: list[str] = Field(min_length=1, max_length=12)
    preserve_audio: bool = True
    story_id: str | None = None


class ModelConfig(BaseModel):
    model: str = model_api.DEFAULT_MODEL
    api_key: SecretStr | None = None


class StoryRequest(BaseModel):
    consent: bool = False
    duration: int = Field(default=30, ge=5, le=60)


class StoryApply(BaseModel):
    story_id: str
    title: str = Field(min_length=1, max_length=30)
    weekly_note: str = Field(min_length=1, max_length=500)
    chapters: list[Chapter] | None = Field(default=None, min_length=1, max_length=8)


class ReviewRequest(BaseModel):
    reviewed: bool = False


class MergeRequest(BaseModel):
    other_id: str


class SplitRequest(BaseModel):
    face_ids: list[str] = Field(min_length=1, max_length=500)


class AnalyzeRequest(BaseModel):
    sample_interval: float = Field(default=1, ge=0.5, le=2)


def create_app(data_root=None):
    store = Store(data_root or os.getenv("MOMENTFLOW_DATA_DIR", ROOT / ".momentflow-data"))
    jobs = Jobs(store)
    key_path = store.root / ".session-key"
    if not key_path.exists():
        key_path.write_bytes(secrets.token_bytes(32))
        os.chmod(key_path, 0o600)
    key = key_path.read_bytes()

    @asynccontextmanager
    async def lifespan(app):
        yield
        for event in list(jobs.events.values()):
            event.set()
        jobs.pool.shutdown(wait=True, cancel_futures=True)

    app = FastAPI(title="MomentFlow Local Pipeline", lifespan=lifespan)
    app.state.store = store
    app.state.jobs = jobs

    def owner(request):
        raw = request.cookies.get(COOKIE, "")
        try:
            identifier, signature = raw.split(".")
            valid = hmac.compare_digest(
                hmac.new(key, identifier.encode(), "sha256").hexdigest(), signature
            )
            if not valid or len(identifier) != 32:
                raise ValueError()
            return identifier
        except ValueError:
            raise HTTPException(401, "请刷新页面以建立本地会话。")

    def project_for(project_id, request):
        try:
            return store.load(project_id, owner(request))
        except (OSError, ValueError):
            raise HTTPException(404, "项目不存在，或不属于当前本地会话。")

    def editable(project):
        if project.get("job") and project["job"]["status"] == "running":
            raise HTTPException(409, "任务进行中，请等待或取消后再修改。")

    def person_for(project, person_id):
        person = next((p for p in project["people"] if p["id"] == person_id), None)
        if not person:
            raise HTTPException(404, "人物不存在。")
        return person

    def output_for(project, export_id):
        output = next((e for e in project["exports"] if e["id"] == export_id), None)
        if not output:
            raise HTTPException(404, "影片不存在。")
        if not export_current(project, output):
            raise HTTPException(409, "素材或人物信息已改变，请重新生成和审核。")
        return output

    @app.middleware("http")
    async def local_boundary(request, call_next):
        origin = request.headers.get("origin")
        if origin:
            from urllib.parse import urlparse

            if urlparse(origin).hostname not in {"localhost", "127.0.0.1", "::1", "testserver"}:
                return JSONResponse({"detail": "仅允许本地应用访问。"}, status_code=403)
        if (
            request.method not in {"GET", "HEAD", "OPTIONS"}
            and request.headers.get("x-momentflow-client") != "local"
        ):
            return JSONResponse({"detail": "缺少本地客户端请求标记。"}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/api/bootstrap")
    def bootstrap(request: Request, response: Response):
        try:
            owner(request)
        except HTTPException:
            identifier = secrets.token_hex(16)
            signature = hmac.new(key, identifier.encode(), "sha256").hexdigest()
            response.set_cookie(
                COOKIE,
                f"{identifier}.{signature}",
                httponly=True,
                samesite="strict",
                max_age=30 * 86400,
            )
        from .download_models import MODEL_DIR, MODELS

        return {
            "models_ready": all((MODEL_DIR / name).exists() for name in MODELS),
            "ffmpeg_ready": bool(shutil.which("ffmpeg") and shutil.which("ffprobe")),
            "engine": "YuNet + SFace",
            "local_only": False,
            "face_recognition_local": True,
            "story_provider": "OpenRouter",
        }

    @app.get("/api/model-config")
    def get_model_config(request: Request):
        return model_api.public_config(model_api.load_config(store, owner(request)))

    @app.put("/api/model-config")
    def set_model_config(body: ModelConfig, request: Request):
        try:
            return model_api.save_config(
                store,
                owner(request),
                body.model,
                body.api_key.get_secret_value() if body.api_key is not None else None,
            )
        except ValueError as error:
            raise HTTPException(422, str(error))

    @app.post("/api/model-config/test")
    def test_model_config(request: Request):
        config = model_api.load_config(store, owner(request))
        try:
            result, _ = model_api.complete(
                config,
                [{"role": "user", "content": 'Return {"ok":true}'}],
                {
                    "type": "object",
                    "properties": {"ok": {"type": "boolean"}},
                    "required": ["ok"],
                    "additionalProperties": False,
                },
                max_tokens=512,
            )
            if result.get("ok") is not True:
                raise ValueError("模型连接测试未返回预期结果。")
            return {"ok": True, "model": config["model"]}
        except ValueError as error:
            raise HTTPException(422, str(error))

    @app.get("/api/projects")
    def list_projects(request: Request):
        return [public_view(p) for p in store.list(owner(request))]

    @app.post("/api/projects")
    def create_project(body: CreateProject, request: Request):
        if body.mode not in {"adventure", "kindergarten"} or not body.consent:
            raise HTTPException(422, "请选择场景并确认有权处理所选素材。")
        return public_view(
            store.create(owner(request), body.mode, body.title.strip(), body.class_name.strip())
        )

    @app.get("/api/projects/{project_id}")
    def get_project(project_id: str, request: Request):
        return public_view(project_for(project_id, request))

    def add_files(project, uploads):
        editable(project)
        if len(project["media"]) + len(uploads) > 30:
            raise HTTPException(422, "每个项目最多 30 份素材，请新建项目。")
        directory = store.directory(project["id"]) / "sources"
        directory.mkdir(exist_ok=True)
        added, paths = [], []
        known = {m["sha256"] for m in project["media"]}
        try:
            total = sum(m["size"] for m in project["media"])
            for name, reader in uploads:
                suffix = Path(name).suffix.lower()
                if suffix not in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
                    raise ValueError("文件格式不支持，请导入照片或常见视频。")
                media_id = str(uuid.uuid4())
                path = directory / f"{media_id}{suffix}"
                paths.append(path)
                digest, size = hashlib.sha256(), 0
                with path.open("wb") as destination:
                    while chunk := reader.read(1024 * 1024):
                        size += len(chunk)
                        total += len(chunk)
                        if size > 100 * 1024 * 1024 or total > 500 * 1024 * 1024:
                            raise ValueError("单份素材最多 100 MB，每项目合计最多 500 MB。")
                        digest.update(chunk)
                        destination.write(chunk)
                if digest.hexdigest() in known:
                    path.unlink()
                    continue
                metadata = probe(path)
                thumb = directory / f"{media_id}.thumb.jpg"
                paths.append(thumb)
                _, frame = next(sample_frames({"path": str(path), **metadata}, 1))
                factor = min(1.0, 640 / max(frame.shape[:2]))
                cv2.imwrite(str(thumb), cv2.resize(frame, None, fx=factor, fy=factor))
                added.append(
                    {
                        "id": media_id,
                        "name": Path(name.replace("\\", "/")).name[:120],
                        "path": str(path),
                        "sha256": digest.hexdigest(),
                        "size": size,
                        "status": "imported",
                        **metadata,
                    }
                )
                known.add(digest.hexdigest())
            if not added:
                raise ValueError("没有新增素材：所选文件与项目中的文件相同。")

            def commit(current):
                current["media"].extend(added)
                current["analysis_version"] += 1

            return public_view(store.update(project["id"], commit))
        except Exception as error:
            for path in paths:
                path.unlink(missing_ok=True)
            if isinstance(error, HTTPException):
                raise
            if isinstance(error, (subprocess.CalledProcessError, subprocess.TimeoutExpired)):
                raise HTTPException(422, "无法读取素材，请检查文件格式、时长与编码。")
            raise HTTPException(422, str(error).replace(str(store.root), "[本地数据目录]")[:250])

    @app.post("/api/projects/{project_id}/media")
    def upload_media(project_id: str, request: Request, files: Annotated[list[UploadFile], File()]):
        with store.lock:
            project = project_for(project_id, request)
            return add_files(project, [(f.filename or "upload", f.file) for f in files])

    @app.post("/api/projects/{project_id}/samples")
    def import_samples(project_id: str, request: Request):
        project = project_for(project_id, request)
        paths = (
            list((ROOT / "demo/public/samples/kindergarten").glob("*"))
            if project["mode"] == "kindergarten"
            else [
                ROOT / "demo/public/media/zipline.jpg",
                ROOT / "demo/public/media/kart.jpg",
                ROOT / "demo/public/samples/webcam.mp4",
                ROOT / "demo/public/samples/webcam-photo.jpg",
            ]
        )
        paths = [
            p
            for p in paths
            if p.suffix.lower() in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS and p.exists()
        ]
        if not paths:
            raise HTTPException(404, "演示素材尚未准备。")
        from contextlib import ExitStack

        with store.lock, ExitStack() as stack:
            project = project_for(project_id, request)
            editable(project)
            if project["mode"] == "kindergarten" and not project["people"]:
                crops = store.directory(project_id) / "crops"
                crops.mkdir(exist_ok=True)
                for filename, name in [
                    ("xiaoman", "林小满"),
                    ("yuan", "周予安"),
                    ("yinuo", "陈一诺"),
                ]:
                    image = load_image(ROOT / f"demo/public/samples/references/{filename}.jpg")
                    detections = jobs.get_engine().detect(image)
                    if len(detections) != 1 or not detections[0]["embedding"]:
                        raise HTTPException(422, "示例参考档案无法识别。")
                    face = detections[0]
                    fid = secrets.token_hex(12)
                    crop_path = crops / f"{fid}.jpg"
                    cv2.imwrite(str(crop_path), face.pop("crop"))
                    project["faces"].append(
                        {
                            "id": fid,
                            "media_id": "reference",
                            "timestamp": 0.0,
                            "reference": True,
                            "crop_path": str(crop_path),
                            **face,
                        }
                    )
                    project["people"].append(
                        {
                            "id": str(uuid.uuid4()),
                            "name": name,
                            "face_ids": [fid],
                            "confirmed": False,
                            "authorized": True,
                            "revision": 0,
                            "note": "",
                            "review_reason": "虚构儿童参考档案；请核对实际聚类结果",
                        }
                    )
                store.save(project)
            return add_files(project, [(p.name, stack.enter_context(p.open("rb"))) for p in paths])

    @app.post("/api/projects/{project_id}/analyze")
    def analyze(project_id: str, body: AnalyzeRequest, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            if not any(m["status"] != "analyzed" for m in project["media"]):
                raise HTTPException(422, "请先导入新素材。")
            # Keep a single sampling policy across incremental imports in one project.
            if project["faces"] and body.sample_interval != project["sample_interval"]:
                raise HTTPException(422, "已有分析结果，请保持当前抽帧间隔；更改精度请新建项目。")
            project["sample_interval"] = body.sample_interval
            store.save(project)
            jobs.start(project_id, "analysis", jobs.analyze)
        return public_view(store.load(project_id))

    @app.post("/api/projects/{project_id}/cancel")
    def cancel(project_id: str, request: Request):
        project_for(project_id, request)
        jobs.cancel(project_id)
        return {"ok": True}

    @app.get("/api/projects/{project_id}/people/{person_id}/segments")
    def get_segments(project_id: str, person_id: str, request: Request):
        project = project_for(project_id, request)
        return segments_for(project, person_for(project, person_id))

    @app.patch("/api/projects/{project_id}/people/{person_id}")
    def edit_person(project_id: str, person_id: str, body: PersonEdit, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            person = person_for(project, person_id)
            if body.confirmed and (body.name.startswith("待命名") or not body.authorized):
                raise HTTPException(422, "请填写人物姓名，并确认相应拍摄与领取授权。")
            values = body.model_dump()
            values["name"] = values["name"].strip()
            if not values["name"]:
                raise HTTPException(422, "姓名不能为空。")
            if any(person.get(k) != v for k, v in values.items()):
                person.update(values)
                person["revision"] += 1
                store.save(project)
        return public_view(project)

    @app.post("/api/projects/{project_id}/people/{person_id}/merge")
    def merge(project_id: str, person_id: str, body: MergeRequest, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            target = person_for(project, person_id)
            other = person_for(project, body.other_id)
            if target["id"] == other["id"]:
                raise HTTPException(422, "请选择另一组人物。")
            a = [f for f in project["faces"] if f["id"] in target["face_ids"]]
            b = [f for f in project["faces"] if f["id"] in other["face_ids"]]
            if any(cooccurs(left, right) for left in a for right in b):
                raise HTTPException(409, "两组人物在同一帧同时出现，不能合并。请先检查误检人脸。")
            target["face_ids"] += other["face_ids"]
            target.update(confirmed=False, revision=target["revision"] + 1)
            project["people"] = [p for p in project["people"] if p["id"] != other["id"]]
            project["analysis_version"] += 1
            store.save(project)
        return public_view(project)

    @app.post("/api/projects/{project_id}/people/{person_id}/split")
    def split(project_id: str, person_id: str, body: SplitRequest, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            person = person_for(project, person_id)
            selected = set(body.face_ids)
            if not selected < set(person["face_ids"]):
                raise HTTPException(422, "请选择该人物组中的部分人脸，至少保留一张。")
            person["face_ids"] = [fid for fid in person["face_ids"] if fid not in selected]
            person.update(confirmed=False, revision=person["revision"] + 1)
            project["people"].append(
                {
                    "id": str(uuid.uuid4()),
                    "name": "待命名人物（拆分）",
                    "face_ids": list(selected),
                    "confirmed": False,
                    "authorized": False,
                    "revision": 0,
                    "note": "",
                    "review_reason": "人工拆分后请重新核对",
                }
            )
            project["analysis_version"] += 1
            store.save(project)
        return public_view(project)

    @app.post("/api/projects/{project_id}/enroll")
    def enroll(
        project_id: str,
        request: Request,
        file: Annotated[UploadFile, File()],
        name: str = Form(...),
        authorized: bool = Form(False),
    ):
        project = project_for(project_id, request)
        editable(project)
        if not name.strip() or len(name) > 30 or not authorized:
            raise HTTPException(422, "请填写姓名并确认已获得相应授权。")
        content = file.file.read(10 * 1024 * 1024 + 1)
        if (
            len(content) > 10 * 1024 * 1024
            or Path(file.filename or "").suffix.lower() not in IMAGE_EXTENSIONS
        ):
            raise HTTPException(422, "档案参考照片应为 10 MB 以内的 JPG、PNG 或 WebP。")
        path = store.directory(project_id) / f"reference-{uuid.uuid4()}.jpg"
        try:
            path.write_bytes(content)
            found = jobs.get_engine().detect(load_image(path))
            if len(found) != 1 or not found[0]["embedding"]:
                raise ValueError("参考照片必须只有一张清晰正面人脸。")
            face = found[0]
            fid = secrets.token_hex(12)
            crop_path = store.directory(project_id) / f"reference-{fid}.jpg"
            cv2.imwrite(str(crop_path), face.pop("crop"))
            person = {
                "id": str(uuid.uuid4()),
                "name": name.strip(),
                "face_ids": [fid],
                "confirmed": True,
                "authorized": True,
                "revision": 0,
                "note": "",
                "review_reason": "通过授权参考照片登记",
            }

            def commit(current):
                editable(current)
                current["faces"].append(
                    {
                        "id": fid,
                        "media_id": "reference",
                        "timestamp": 0.0,
                        "crop_path": str(crop_path),
                        "reference": True,
                        **face,
                    }
                )
                current["people"].append(person)
                current["analysis_version"] += 1

            return public_view(store.update(project_id, commit))
        except ValueError as error:
            raise HTTPException(422, str(error))
        finally:
            path.unlink(missing_ok=True)

    @app.post("/api/projects/{project_id}/people/{person_id}/story")
    def create_story(project_id: str, person_id: str, body: StoryRequest, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            person = person_for(project, person_id)
            if not person["confirmed"] or not person["authorized"]:
                raise HTTPException(409, "先核对人物和授权，再分析故事。")
            if not body.consent:
                raise HTTPException(
                    422, "请确认向 OpenRouter / OpenAI 发送此人物的候选画面进行分析。"
                )
            config = model_api.load_config(store, owner(request))
            if not config.get("api_key"):
                raise HTTPException(422, "请先在设置中配置 OpenRouter API Key。")

            def work(snapshot, check, progress):
                from .story import analyze_story

                result = analyze_story(
                    snapshot, person_id, config, jobs.get_engine(), body.duration, check, progress
                )
                check()

                def commit(current):
                    person_for(current, person_id)["story"] = result

                store.update(project_id, commit)

            jobs.start(project_id, "story", work)
        return public_view(store.load(project_id))

    @app.post("/api/projects/{project_id}/people/{person_id}/story/apply")
    def apply_story(project_id: str, person_id: str, body: StoryApply, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            person = person_for(project, person_id)
            story = current_story(project, person)
            if not person["confirmed"] or not person["authorized"]:
                raise HTTPException(409, "先核对人物和授权，再采用故事草稿。")
            if not story or story["id"] != body.story_id:
                raise HTTPException(409, "故事草稿已过期，请重新分析。")
            if not body.title.strip() or not body.weekly_note.strip():
                raise HTTPException(422, "标题和周记不能为空。")
            if body.chapters is not None:
                if [chapter.segment_id for chapter in body.chapters] != story["selected_ids"]:
                    raise HTTPException(422, "章节必须与推荐片段一一对应，且保持相同顺序。")
                if any(not c.heading.strip() or not c.caption.strip() for c in body.chapters):
                    raise HTTPException(422, "章节标题与字幕不能为空。")
                story["chapters"] = [chapter.model_dump() for chapter in body.chapters]
            story.update(title=body.title.strip(), weekly_note=body.weekly_note.strip())
            person.update(
                note=body.weekly_note.strip(),
                story_title=body.title.strip(),
                applied_story_id=story["id"],
                revision=person["revision"] + 1,
            )
            story["applied"] = True
            store.save(project)
        return public_view(project)

    @app.post("/api/projects/{project_id}/people/{person_id}/render")
    def render(project_id: str, person_id: str, body: RenderRequest, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            person = person_for(project, person_id)
            if not person["confirmed"] or not person["authorized"]:
                raise HTTPException(409, "先核对人物身份和授权范围，再生成集锦。")
            catalog = {s["id"]: s for s in segments_for(project, person)}
            if len(set(body.segment_ids)) != len(body.segment_ids) or any(
                s not in catalog for s in body.segment_ids
            ):
                raise HTTPException(422, "包含重复、过期或不属于此人物的片段。")
            if sum(catalog[s]["duration"] for s in body.segment_ids) > 60:
                raise HTTPException(422, "每份集锦最多 60 秒，请减少片段。")
            if body.story_id:
                story = current_story(project, person)
                if (
                    not story
                    or story["id"] != body.story_id
                    or person.get("applied_story_id") != body.story_id
                    or set(body.segment_ids) != set(story["selected_ids"])
                ):
                    raise HTTPException(
                        409, "故事草稿、选段或采用状态已改变，请重新采用或手动生成。"
                    )
            person["revision"] += 1
            store.save(project)
            jobs.start(
                project_id,
                "render",
                lambda p, check, progress: jobs.render(
                    p,
                    person_id,
                    body.segment_ids,
                    check,
                    progress,
                    body.preserve_audio,
                    body.story_id,
                ),
            )
        return public_view(store.load(project_id))

    @app.post("/api/projects/{project_id}/exports/{export_id}/approve")
    def approve(project_id: str, export_id: str, body: ReviewRequest, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            output = output_for(project, export_id)
            person = person_for(project, output["person_id"])
            if not body.reviewed or not person["confirmed"] or not person["authorized"]:
                raise HTTPException(409, "请人工确认人物、画面范围、字幕及授权。")
            output["approved"] = True
            store.save(project)
        return public_view(project)

    @app.post("/api/projects/{project_id}/exports/{export_id}/deliver")
    def deliver(project_id: str, export_id: str, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            output = output_for(project, export_id)
            if not output["approved"]:
                raise HTTPException(409, "当前版本尚未审核。")
            output["delivered"] = True
            store.save(project)
        return public_view(project)

    @app.get("/api/projects/{project_id}/media/{media_id}/{variant}")
    def media_file(project_id: str, media_id: str, variant: str, request: Request):
        project = project_for(project_id, request)
        media = next((m for m in project["media"] if m["id"] == media_id), None)
        if not media or variant not in {"source", "thumbnail"}:
            raise HTTPException(404)
        path = (
            Path(media["path"])
            if variant == "source"
            else Path(media["path"]).with_name(Path(media["path"]).stem + ".thumb.jpg")
        )
        return FileResponse(path)

    @app.get("/api/projects/{project_id}/faces/{face_id}")
    def face_file(project_id: str, face_id: str, request: Request):
        project = project_for(project_id, request)
        face = next((f for f in project["faces"] if f["id"] == face_id), None)
        if not face:
            raise HTTPException(404)
        return FileResponse(face["crop_path"], media_type="image/jpeg")

    @app.get("/api/projects/{project_id}/exports/{export_id}/{variant}")
    def export_file(project_id: str, export_id: str, variant: str, request: Request):
        project = project_for(project_id, request)
        output = output_for(project, export_id)
        if variant not in {"preview", "claim"}:
            raise HTTPException(404)
        if variant == "claim" and not (output["approved"] and output["delivered"]):
            raise HTTPException(403, "影片还未审核交付。")
        person = person_for(project, output["person_id"])
        return FileResponse(
            output["path"],
            media_type="video/mp4",
            filename=f"{person['name']}-MomentFlow.mp4" if variant == "claim" else None,
        )

    @app.delete("/api/projects/{project_id}")
    def delete_project(project_id: str, request: Request):
        with store.lock:
            project = project_for(project_id, request)
            editable(project)
            shutil.rmtree(store.directory(project_id))
        return {"ok": True}

    return app


app = create_app()
