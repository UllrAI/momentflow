import hashlib
import json
import shutil
import subprocess
import threading
import time
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from momentflow.app import create_app
from momentflow.faces import cluster_faces
from momentflow.media import segments_for
from momentflow.pipeline import Jobs, mask_others
from momentflow.store import Store

ROOT = Path(__file__).resolve().parents[2]
HEADERS = {"X-MomentFlow-Client": "local"}
MODELS = ROOT / "backend/models/face_recognition_sface_2021dec.onnx"


def vector(angle):
    angle = np.deg2rad(angle)
    return [float(np.cos(angle)), float(np.sin(angle))]


def face(fid, angle, media="photo", time=0):
    return {"id": fid, "embedding": vector(angle), "media_id": media, "timestamp": time}


def wait_job(client, pid, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        project = client.get(f"/api/projects/{pid}").json()
        if project["job"]["status"] != "running":
            assert project["job"]["status"] == "done", project["job"]
            return project
        time.sleep(0.1)
    raise AssertionError("pipeline timed out")


def create(client, mode="adventure"):
    client.get("/api/bootstrap")
    response = client.post(
        "/api/projects",
        json={"title": "integration test", "mode": mode, "consent": True},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


def confirm(client, project, person, name="测试人物"):
    response = client.patch(
        f"/api/projects/{project['id']}/people/{person['id']}",
        json={
            "name": name,
            "confirmed": True,
            "authorized": True,
            "note": "仅记录实际活动，不推断性格与能力。",
        },
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_complete_link_prevents_chain_merge_and_same_frame_faces():
    groups = cluster_faces([face("a", 0), face("b", 1)])
    assert len(groups) == 2
    groups = cluster_faces([face("a", 0, "a"), face("b", 50, "b"), face("c", 80, "c")])
    assert len(groups) == 2
    assert groups[0]["face_ids"] == ["a", "b"]


def test_ambiguous_probe_stays_separate_and_new_matches_require_review():
    a, b = face("a", -20, "a"), face("b", 20, "b")
    existing = [
        {"id": "a", "face_ids": ["a"], "confirmed": True},
        {"id": "b", "face_ids": ["b"], "confirmed": True},
    ]
    assert len(cluster_faces([a, b, face("c", 0, "c")], existing)) == 3
    only = cluster_faces([a, face("d", -21, "d")], existing[:1])
    assert only[0]["confirmed"] is False


def test_segments_do_not_bridge_unobserved_gaps():
    faces = [dict(face(str(i), 0, "video", t), confidence=0.99) for i, t in enumerate([0, 1, 8])]
    project = {
        "id": "project",
        "sample_interval": 1,
        "media": [{"id": "video", "name": "video.mp4", "kind": "video", "duration": 10}],
        "faces": faces,
    }
    segments = segments_for(project, {"id": "person", "face_ids": ["0", "1", "2"]})
    assert len(segments) == 2
    assert segments[0]["end"] < segments[1]["start"] - 5


def test_non_target_face_is_masked_and_target_is_unchanged():
    class Engine:
        def detect(self, frame, quality_gate=False):
            return [
                {"bbox": [10, 10, 20, 20], "embedding": vector(0)},
                {"bbox": [60, 10, 20, 20], "embedding": vector(90)},
            ]

    frame = np.random.default_rng(1).integers(0, 255, (100, 100, 3), dtype=np.uint8)
    result = mask_others(frame, Engine(), [vector(0)], [vector(90)])
    np.testing.assert_array_equal(result[10:30, 10:30], frame[10:30, 10:30])
    assert not np.array_equal(result[10:30, 60:80], frame[10:30, 60:80])


def test_local_session_isolation_and_atomic_validation(tmp_path):
    app = create_app(tmp_path)
    with TestClient(app) as client:
        project = create(client)
        pid = project["id"]
        original = (ROOT / "demo/public/samples/kindergarten/blocks.jpg").read_bytes()
        bad = client.post(
            f"/api/projects/{pid}/media",
            files=[
                ("files", ("good.jpg", original, "image/jpeg")),
                ("files", ("bad.mp4", b"not a video", "video/mp4")),
            ],
            headers=HEADERS,
        )
        assert bad.status_code == 422
        assert str(tmp_path) not in bad.text
        assert client.get(f"/api/projects/{pid}").json()["media"] == []
        upload = client.post(
            f"/api/projects/{pid}/media",
            files={"files": ("../../original.jpg", original, "image/jpeg")},
            headers=HEADERS,
        )
        assert upload.status_code == 200, upload.text
        media = upload.json()["media"][0]
        source = client.get(media["url"])
        assert hashlib.sha256(source.content).digest() == hashlib.sha256(original).digest()
        assert "path" not in media and "sha256" not in media
        assert client.get(media["thumbnail"]).status_code == 200
        assert (
            client.post(
                f"/api/projects/{pid}/media",
                files={"files": ("again.jpg", original, "image/jpeg")},
                headers=HEADERS,
            ).status_code
            == 422
        )
        assert client.post("/api/projects", json={"title": "x", "consent": True}).status_code == 403
        assert (
            client.get(
                f"/api/projects/{pid}", headers={"Origin": "https://untrusted.example"}
            ).status_code
            == 403
        )
        with TestClient(app) as stranger:
            stranger.get("/api/bootstrap")
            assert stranger.get(f"/api/projects/{pid}").status_code == 404
            assert stranger.get(media["url"]).status_code == 404
            assert stranger.get("/api/projects").json() == []
        saved_cookies = dict(client.cookies)
    with TestClient(create_app(tmp_path)) as reloaded:
        reloaded.cookies.update(saved_cookies)
        assert reloaded.get(f"/api/projects/{pid}").json()["media"][0]["id"] == media["id"]


@pytest.mark.skipif(
    not MODELS.exists() or not shutil.which("ffmpeg"), reason="Run npm run setup first"
)
def test_real_kindergarten_pipeline_render_review_and_staleness(tmp_path):
    app = create_app(tmp_path)
    with TestClient(app) as client:
        project = create(client, "kindergarten")
        pid = project["id"]
        response = client.post(f"/api/projects/{pid}/samples", headers=HEADERS)
        assert response.status_code == 200, response.text
        response = client.post(
            f"/api/projects/{pid}/analyze", json={"sample_interval": 1}, headers=HEADERS
        )
        assert response.status_code == 200, response.text
        project = wait_job(client, pid)
        assert len(project["people"]) == 3, [
            (p["name"], p["face_count"]) for p in project["people"]
        ]
        assert {p["name"] for p in project["people"]} == {"林小满", "周予安", "陈一诺"}
        assert all(p["face_count"] >= 7 and not p["confirmed"] for p in project["people"])
        assert all("embedding" not in f and "crop_path" not in f for f in project["faces"])
        assert all(f["usable_for_matching"] for f in project["faces"])
        person = project["people"][0]
        candidate = client.get(f"/api/projects/{pid}/people/{person['id']}/segments").json()
        assert {s["kind"] for s in candidate} == {"image", "video"}
        assert (
            client.post(
                f"/api/projects/{pid}/people/{person['id']}/render",
                json={"segment_ids": [candidate[0]["id"]]},
                headers=HEADERS,
            ).status_code
            == 409
        )
        assert (
            client.post(
                f"/api/projects/{pid}/people/{person['id']}/merge",
                json={"other_id": project["people"][1]["id"]},
                headers=HEADERS,
            ).status_code
            == 409
        )
        movable = next(
            f["id"]
            for f in project["faces"]
            if f["id"] in person["face_ids"] and not f["reference"]
        )
        split = client.post(
            f"/api/projects/{pid}/people/{person['id']}/split",
            json={"face_ids": [movable]},
            headers=HEADERS,
        )
        assert split.status_code == 200, split.text
        assert len(split.json()["people"]) == 4
        fragment = next(p for p in split.json()["people"] if p["name"] == "待命名人物（拆分）")
        merged = client.post(
            f"/api/projects/{pid}/people/{person['id']}/merge",
            json={"other_id": fragment["id"]},
            headers=HEADERS,
        )
        assert merged.status_code == 200, merged.text
        project = merged.json()
        project = confirm(client, project, person, person["name"])
        selected = [
            next(s["id"] for s in candidate if s["kind"] == "image"),
            next(s["id"] for s in candidate if s["kind"] == "video"),
        ]
        response = client.post(
            f"/api/projects/{pid}/people/{person['id']}/render",
            json={"segment_ids": selected},
            headers=HEADERS,
        )
        assert response.status_code == 200, response.text
        project = wait_job(client, pid)
        output = project["exports"][-1]
        assert output["current"] and output["width"] == 1280 and output["height"] == 720
        assert client.get(output["url"], headers={"Range": "bytes=0-31"}).status_code == 206
        assert client.get(output["claim_url"]).status_code == 403
        base = f"/api/projects/{pid}/exports/{output['id']}"
        assert client.post(base + "/deliver", headers=HEADERS).status_code == 409
        assert (
            client.post(base + "/approve", json={"reviewed": False}, headers=HEADERS).status_code
            == 409
        )
        assert (
            client.post(base + "/approve", json={"reviewed": True}, headers=HEADERS).status_code
            == 200
        )
        assert client.post(base + "/deliver", headers=HEADERS).status_code == 200
        download = client.get(output["claim_url"])
        assert download.status_code == 200 and len(download.content) > 10000
        rendered = tmp_path / "verified.mp4"
        rendered.write_bytes(download.content)
        info = json.loads(
            subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_streams",
                    "-show_format",
                    "-of",
                    "json",
                    str(rendered),
                ]
            )
        )
        assert info["streams"][0]["width"] == 1280
        assert float(info["format"]["duration"]) >= 7.9
        changed = client.patch(
            f"/api/projects/{pid}/people/{person['id']}",
            json={
                "name": person["name"],
                "confirmed": True,
                "authorized": True,
                "note": "修改后的活动记录",
            },
            headers=HEADERS,
        )
        assert changed.status_code == 200
        assert client.get(output["claim_url"]).status_code == 409
        assert client.get(output["url"]).status_code == 409
        assert changed.json()["exports"][-1]["current"] is False


@pytest.mark.skipif(not MODELS.exists(), reason="Run npm run setup first")
@pytest.mark.parametrize("fps", [None, 2])
def test_real_motion_video_and_photo_resolve_to_same_person(tmp_path, fps):
    app = create_app(tmp_path)
    with TestClient(app) as client:
        project = create(client)
        pid = project["id"]
        uploads = []
        video = ROOT / "demo/public/samples/webcam.mp4"
        if fps:
            low_fps = tmp_path / "low-fps.mp4"
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(video),
                    "-vf",
                    f"fps={fps}",
                    "-an",
                    str(low_fps),
                ],
                check=True,
            )
            video = low_fps
        for path in [
            video,
            ROOT / "demo/public/samples/webcam-photo.jpg",
            ROOT / "demo/public/media/forest.jpg",
        ]:
            uploads.append(("files", (path.name, path.read_bytes(), "application/octet-stream")))
        response = client.post(f"/api/projects/{pid}/media", files=uploads, headers=HEADERS)
        assert response.status_code == 200, response.text
        client.post(f"/api/projects/{pid}/analyze", json={"sample_interval": 1}, headers=HEADERS)
        project = wait_job(client, pid)
        # Pose changes can conservatively split one identity. A reviewer resolves those
        # fragments without reducing thresholds or inventing an automatic identity match.
        photo_id = next(m["id"] for m in project["media"] if m["name"] == "webcam-photo.jpg")
        photo_faces = {f["id"] for f in project["faces"] if f["media_id"] == photo_id}
        person = next(p for p in project["people"] if photo_faces & set(p["face_ids"]))
        assert person["face_count"] >= 2  # photo and at least one real video frame
        for other in list(project["people"]):
            if other["id"] != person["id"]:
                response = client.post(
                    f"/api/projects/{pid}/people/{person['id']}/merge",
                    json={"other_id": other["id"]},
                    headers=HEADERS,
                )
                assert response.status_code == 200, response.text
                project = response.json()
        person = project["people"][0]
        assert person["face_count"] >= 7
        project = confirm(client, project, person)
        segments = client.get(f"/api/projects/{pid}/people/{person['id']}/segments").json()
        assert {s["kind"] for s in segments} == {"image", "video"}
        client.post(
            f"/api/projects/{pid}/people/{person['id']}/render",
            json={"segment_ids": [segment["id"] for segment in segments]},
            headers=HEADERS,
        )
        project = wait_job(client, pid)
        output = app.state.store.load(pid)["exports"][-1]
        assert output["duration"] >= 10.4  # includes the fractional final video segment
        cap = cv2.VideoCapture(output["path"])
        ok, first = cap.read()
        assert ok
        cap.set(cv2.CAP_PROP_POS_MSEC, 3000)
        ok, later = cap.read()
        cap.release()
        assert ok
        assert float(np.abs(first.astype(float) - later.astype(float)).mean()) > 0.4
        assert next(m for m in project["media"] if m["name"] == "forest.jpg")["warning"]


def test_cancelled_job_does_not_publish_a_result(tmp_path):
    store = Store(tmp_path)
    project = store.create("owner", "adventure", "x", "")
    jobs = Jobs(store)
    started = threading.Event()

    def work(snapshot, check, progress):
        started.set()
        while True:
            check()
            time.sleep(0.01)

    jobs.start(project["id"], "test", work)
    assert started.wait(2)
    jobs.cancel(project["id"])
    jobs.pool.shutdown(wait=True)
    assert store.load(project["id"])["job"]["status"] == "cancelled"
    assert not store.load(project["id"])["exports"]


@pytest.mark.skipif(not MODELS.exists(), reason="Run npm run setup first")
def test_explicit_reference_enrollment_and_rejection_of_group_reference(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        project = create(client, "kindergarten")
        pid = project["id"]
        reference = ROOT / "demo/public/samples/references/xiaoman.jpg"
        response = client.post(
            f"/api/projects/{pid}/enroll",
            data={"name": "参考儿童", "authorized": "true"},
            files={"file": (reference.name, reference.read_bytes(), "image/jpeg")},
            headers=HEADERS,
        )
        assert response.status_code == 200, response.text
        assert response.json()["people"][0]["name"] == "参考儿童"
        assert response.json()["people"][0]["face_count"] == 0
        group = ROOT / "demo/public/samples/kindergarten/blocks.jpg"
        rejected = client.post(
            f"/api/projects/{pid}/enroll",
            data={"name": "错误参考", "authorized": "true"},
            files={"file": (group.name, group.read_bytes(), "image/jpeg")},
            headers=HEADERS,
        )
        assert rejected.status_code == 422
        assert len(client.get(f"/api/projects/{pid}").json()["people"]) == 1
