"""Atomic project persistence. Embeddings and source paths never leave this module's views."""

import json
import os
import threading
import uuid
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path


def now():
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = threading.RLock()
        self.recover()

    def directory(self, project_id):
        if str(uuid.UUID(project_id)) != project_id:
            raise ValueError("Invalid project id")
        return self.root / project_id

    def load(self, project_id, owner=None):
        with self.lock:
            path = self.directory(project_id) / "project.json"
            project = json.loads(path.read_text())
            if owner is not None and project["owner"] != owner:
                raise FileNotFoundError()
            return project

    def save(self, project):
        with self.lock:
            project["updated_at"] = now()
            directory = self.directory(project["id"])
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / "project.json"
            temp = directory / "project.tmp"
            temp.write_text(json.dumps(project, ensure_ascii=False))
            os.chmod(temp, 0o600)
            temp.replace(path)

    def update(self, project_id, change):
        with self.lock:
            project = self.load(project_id)
            change(project)
            self.save(project)
            return project

    def create(self, owner, mode, title, class_name):
        project = {
            "id": str(uuid.uuid4()),
            "owner": owner,
            "mode": mode,
            "title": title,
            "class_name": class_name,
            "created_at": now(),
            "updated_at": now(),
            "media": [],
            "faces": [],
            "people": [],
            "exports": [],
            "analysis_version": 0,
            "sample_interval": 1.0,
            "job": None,
        }
        self.save(project)
        return project

    def list(self, owner):
        result = []
        for path in self.root.glob("*/project.json"):
            try:
                project = json.loads(path.read_text())
                if project["owner"] == owner:
                    result.append(project)
            except (OSError, ValueError, KeyError):
                continue
        return sorted(result, key=lambda p: p["created_at"], reverse=True)

    def recover(self):
        for path in self.root.glob("*/project.json"):
            try:
                project = json.loads(path.read_text())
                if project.get("job", {}).get("status") == "running":
                    project["job"].update(status="failed", error="服务重启中断了任务，请重试。")
                    self.save(project)
            except (OSError, ValueError, AttributeError):
                continue


def revision(project, person):
    return [project["analysis_version"], person["revision"]]


def export_current(project, export):
    person = next((p for p in project["people"] if p["id"] == export["person_id"]), None)
    return bool(person and export["version"] == revision(project, person))


def public_view(project):
    result = deepcopy(project)
    result.pop("owner", None)
    for media in result["media"]:
        media.pop("path", None)
        media.pop("sha256", None)
        base = f"/api/projects/{project['id']}/media/{media['id']}"
        media["url"] = base + "/source"
        media["thumbnail"] = base + "/thumbnail"
    for face in result["faces"]:
        face["usable_for_matching"] = face.get("embedding") is not None
        face.pop("embedding", None)
        face.pop("crop_path", None)
        face["thumbnail"] = f"/api/projects/{project['id']}/faces/{face['id']}"
    for person in result["people"]:
        person["face_count"] = sum(
            not face.get("reference") and face["id"] in person["face_ids"]
            for face in result["faces"]
        )
    for export in result["exports"]:
        export.pop("path", None)
        export["current"] = export_current(project, export)
        export["url"] = f"/api/projects/{project['id']}/exports/{export['id']}/preview"
        export["claim_url"] = f"/api/projects/{project['id']}/exports/{export['id']}/claim"
    return result
