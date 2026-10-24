"""Model transport tests use an explicit double; no canned results are shipped in the app."""

import base64
import io
import json
import os
import subprocess
import urllib.error

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from test_pipeline import HEADERS, ROOT, confirm, create, wait_job

from momentflow import model_api
from momentflow.app import create_app
from momentflow.story import candidate_pool, choose_highlights


def test_config_is_private_persistent_and_not_returned(tmp_path):
    app = create_app(tmp_path)
    with TestClient(app) as client:
        client.get("/api/bootstrap")
        assert not client.get("/api/model-config").json()["configured"]
        result = client.put(
            "/api/model-config",
            json={"model": model_api.DEFAULT_MODEL, "api_key": "test-secret-not-a-real-key"},
            headers=HEADERS,
        )
        assert result.status_code == 200
        assert result.json()["configured"]
        assert "test-secret" not in result.text and "api_key" not in result.json()
        file = next(tmp_path.glob("model-*.json"))
        assert os.stat(file).st_mode & 0o777 == 0o600
        assert json.loads(file.read_text())["api_key"] == "test-secret-not-a-real-key"
        assert (
            client.put(
                "/api/model-config", json={"model": "unknown/model"}, headers=HEADERS
            ).status_code
            == 422
        )
        assert client.put(
            "/api/model-config", json={"model": "openai/gpt-6-luna-pro"}, headers=HEADERS
        ).json()["configured"]
        with TestClient(app) as stranger:
            stranger.get("/api/bootstrap")
            assert not stranger.get("/api/model-config").json()["configured"]
        cookies = dict(client.cookies)
    with TestClient(create_app(tmp_path)) as client:
        client.cookies.update(cookies)
        assert client.get("/api/model-config").json()["model"] == "openai/gpt-6-luna-pro"
        assert (
            client.put(
                "/api/model-config",
                json={"model": model_api.DEFAULT_MODEL, "api_key": ""},
                headers=HEADERS,
            ).json()["configured"]
            is False
        )


def test_model_transport_redacts_errors_and_rejects_incomplete_json(monkeypatch):
    config = {"model": model_api.DEFAULT_MODEL, "api_key": "private-key"}

    def failure(request, timeout):
        raise urllib.error.HTTPError(
            request.full_url, 401, "private-key", {}, io.BytesIO(b"private-key")
        )

    monkeypatch.setattr(model_api.urllib.request, "urlopen", failure)
    with pytest.raises(ValueError, match="API Key 无效") as caught:
        model_api.complete(config, [], {})
    assert "private-key" not in str(caught.value)
    monkeypatch.setattr(
        model_api.urllib.request,
        "urlopen",
        lambda *args, **kwargs: io.BytesIO(
            json.dumps(
                {"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]}
            ).encode()
        ),
    )
    with pytest.raises(ValueError, match="完整"):
        model_api.complete(config, [], {})


def test_selection_budget_diversity_and_unseen_target():
    segments = [{"id": str(i), "media_id": str(i), "duration": 5} for i in range(4)]
    observations = [
        {
            "segment_id": str(i),
            "usable": True,
            "score": 95 - i,
            "activity": "积木" if i < 2 else "绘画",
            "stage": "action",
        }
        for i in range(4)
    ]
    frames = {
        str(i): {"visible": [i != 3], "signature": np.full(256, 20 if i < 2 else i * 40)}
        for i in range(4)
    }
    selected = choose_highlights(observations, segments, frames, 10)
    assert [item["segment_id"] for item in selected] == ["0", "2"]
    observations[2]["duplicate_of"] = "0"
    assert [
        item["segment_id"] for item in choose_highlights(observations, segments, frames, 10)
    ] == ["0"]
    many = [{"id": f"{m}-{i}", "media_id": str(m)} for m in range(30) for i in range(20)]
    pool = candidate_pool(many)
    assert len(pool) == 36 and len({s["media_id"] for s in pool}) == 30
    assert len({s["id"] for s in pool}) == 36


def test_selection_keeps_distinct_actions_in_fixed_camera_and_evidenced_story_roles():
    segments = [{"id": str(i), "media_id": "fixed-camera", "duration": 5} for i in range(10)]
    observations = [
        {
            "segment_id": str(i),
            "usable": True,
            "score": 85 if i < 8 else 70,
            "activity": f"操作{i}",
            "stage": "action" if i < 8 else "opening" if i == 8 else "result",
        }
        for i in range(10)
    ]
    # A fixed room can look almost identical while the participant does different things.
    frames = {str(i): {"visible": [True], "signature": np.full(256, 40.0)} for i in range(10)}
    selected = choose_highlights(observations, segments, frames, 15)
    assert [row["stage"] for row in selected] == ["opening", "action", "result"]
    assert {row["segment_id"] for row in selected} == {"0", "8", "9"}
    assert sum(segments[int(row["segment_id"])]["duration"] for row in selected) == 15
    for row in observations:
        row["stage"] = "action"
    assert all(
        row["stage"] == "action" for row in choose_highlights(observations, segments, frames, 15)
    )


class ModelDouble:
    def __init__(self):
        self.requests = []
        self.invalid = False
        self.bad_reference = False

    def __call__(self, request, timeout):
        assert request.full_url == "https://openrouter.ai/api/v1/chat/completions"
        payload = json.loads(request.data)
        self.requests.append(payload)
        assert payload["model"] == model_api.DEFAULT_MODEL
        assert payload["provider"]["data_collection"] == "deny"
        assert payload["response_format"]["json_schema"]["strict"]
        content = payload["messages"][-1]["content"]
        if isinstance(content, list):
            rows = []
            for item in content:
                if item["type"] == "image_url":
                    image = cv2.imdecode(
                        np.frombuffer(
                            base64.b64decode(item["image_url"]["url"].split(",")[1]), dtype=np.uint8
                        ),
                        cv2.IMREAD_COLOR,
                    )
                    assert image.shape[0] == 330
                elif item["type"] == "text" and item["text"].startswith("{"):
                    meta = json.loads(item["text"])
                    assert "name" not in meta and "embedding" not in meta
                    visible = [i + 1 for i, ok in enumerate(meta["target_visible"]) if ok]
                    rows.append(
                        {
                            "segment_id": "bad-id" if self.invalid else meta["id"],
                            "usable": bool(visible),
                            "duplicate_of": "unknown-reference" if self.bad_reference else None,
                            "title": "测试活动观察",
                            "activity": "测试活动",
                            "observation": "目标人物出现在活动画面中。",
                            "stage": "action",
                            "score": 80,
                            "reason": "测试模型的结构化响应。",
                            "evidence_frames": visible,
                        }
                    )
            result = {"observations": rows}
        else:
            context = json.loads(content)
            result = {
                "title": "测试故事标题",
                "weekly_note": "这是一份测试模型返回的活动记录，用于验证草稿与实际选段、字幕和审核版本的关联，不代表真实模型分析结果。",
                "chapters": [
                    {
                        "segment_id": row["segment_id"],
                        "heading": "测试章节",
                        "caption": "目标人物出现在活动画面中。",
                    }
                    for row in context["selected_observations"]
                ],
            }
        return io.BytesIO(
            json.dumps(
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": json.dumps(result, ensure_ascii=False)},
                        }
                    ],
                    "usage": {"total_tokens": 123},
                }
            ).encode()
        )


def test_story_end_to_end_source_binding_apply_render_and_invalid_response(tmp_path, monkeypatch):
    transport = ModelDouble()
    monkeypatch.setattr(model_api.urllib.request, "urlopen", transport)
    app = create_app(tmp_path)
    with TestClient(app) as client:
        project = create(client, "kindergarten")
        pid = project["id"]
        client.post(f"/api/projects/{pid}/samples", headers=HEADERS)
        client.post(f"/api/projects/{pid}/analyze", json={"sample_interval": 1}, headers=HEADERS)
        project = wait_job(client, pid)
        assert project["practice_media"]
        person = project["people"][0]
        path = f"/api/projects/{pid}/people/{person['id']}"
        assert (
            client.post(path + "/story", json={"consent": True}, headers=HEADERS).status_code == 409
        )
        project = confirm(client, project, person, person["name"])
        assert (
            client.post(path + "/story", json={"consent": True}, headers=HEADERS).status_code == 422
        )
        client.put(
            "/api/model-config",
            json={"model": model_api.DEFAULT_MODEL, "api_key": "test-key"},
            headers=HEADERS,
        )
        assert (
            client.post(path + "/story", json={"consent": False}, headers=HEADERS).status_code
            == 422
        )
        assert not transport.requests
        assert (
            client.post(
                path + "/story",
                json={"consent": True, "duration": 15, "locale": "en"},
                headers=HEADERS,
            ).status_code
            == 200
        )
        project = wait_job(client, pid)
        person = next(p for p in project["people"] if p["id"] == person["id"])
        story = person["story"]
        assert story["locale"] == "en"
        assert all(
            "Write all observations" in req["messages"][0]["content"] for req in transport.requests
        )
        assert story["current"] and story["selected_ids"]
        assert person["note"] != story["weekly_note"]  # no automatic replacement
        assert all(sid in story["evidence"] for sid in story["selected_ids"])
        assert len(transport.requests) >= 2
        assert (
            client.post(
                path + "/render",
                json={"segment_ids": story["selected_ids"], "story_id": story["id"]},
                headers=HEADERS,
            ).status_code
            == 409
        )
        result = client.post(
            path + "/story/apply",
            json={
                "story_id": story["id"],
                "title": "人工确认的标题",
                "weekly_note": "人工核对后的活动记录。",
                "chapters": [
                    {**chapter, "heading": "人工修改章节", "caption": "人工核对过的画面字幕。"}
                    for chapter in story["chapters"]
                ],
            },
            headers=HEADERS,
        )
        assert result.status_code == 200, result.text
        assert (
            client.post(
                path + "/render",
                json={"segment_ids": story["selected_ids"], "story_id": story["id"]},
                headers=HEADERS,
            ).status_code
            == 200
        )
        project = wait_job(client, pid)
        output = project["exports"][-1]
        assert output["story_title"] == "人工确认的标题"
        assert output["chapters"][0]["heading"] == "人工修改章节"
        assert output["chapters"][0]["caption"] == "人工核对过的画面字幕。"
        assert output["note"] == "人工核对后的活动记录。"
        assert (
            next(p for p in project["people"] if p["id"] == person["id"])["story"]["model_draft"][
                "title"
            ]
            == "测试故事标题"
        )
        assert output["story_id"] == story["id"]
        old_story_id = story["id"]
        transport.invalid = True
        client.post(path + "/story", json={"consent": True}, headers=HEADERS)
        import time

        for _ in range(300):
            project = client.get(f"/api/projects/{pid}").json()
            if project["job"]["status"] != "running":
                break
            time.sleep(0.05)
        assert project["job"]["status"] == "failed"
        assert (
            next(p for p in project["people"] if p["id"] == person["id"])["story"]["id"]
            == old_story_id
        )
        transport.invalid = False
        transport.bad_reference = True
        client.post(path + "/story", json={"consent": True}, headers=HEADERS)
        for _ in range(300):
            project = client.get(f"/api/projects/{pid}").json()
            if project["job"]["status"] != "running":
                break
            time.sleep(0.05)
        assert project["job"]["status"] == "failed"
        assert "重复画面引用" in project["job"]["error"]
        client.patch(
            path,
            json={"name": "改名后", "note": "保留人工记录", "confirmed": True, "authorized": True},
            headers=HEADERS,
        )
        assert (
            client.post(
                path + "/story/apply",
                json={"story_id": story["id"], "title": "旧标题", "weekly_note": "旧记录"},
                headers=HEADERS,
            ).status_code
            == 409
        )
        assert client.get(output["url"]).status_code == 409


def decoded_audio(path):
    decoded = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "warning",
            "-i",
            str(path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "8000",
            "-f",
            "f32le",
            "pipe:1",
        ],
        capture_output=True,
        check=True,
    )
    assert not decoded.stderr, decoded.stderr.decode()
    return np.frombuffer(decoded.stdout, dtype=np.float32)


def dominant(audio, start, end):
    chunk = audio[int(start * 8000) : int(end * 8000)]
    values = np.abs(np.fft.rfft(chunk))
    return np.fft.rfftfreq(len(chunk), 1 / 8000)[values.argmax()]


def test_original_audio_cut_order_silent_photos_and_mute(tmp_path):
    # Distinct tones are deliberate test audio, not a purported real recording.
    source = tmp_path / "audio-source.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(ROOT / "demo/public/samples/webcam.mp4"),
            "-f",
            "lavfi",
            "-i",
            "aevalsrc=0.18*sin(2*PI*if(lt(t\\,3)\\,440\\,880)*t)+0.08*sin(2*PI*(173*t+227*t*t)):s=48000:d=7.416667",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            str(source),
        ],
        check=True,
    )
    app = create_app(tmp_path / "data")
    with TestClient(app) as client:
        project = create(client)
        pid = project["id"]
        client.post(
            f"/api/projects/{pid}/media",
            files=[
                ("files", ("audio.mp4", source.read_bytes(), "video/mp4")),
                (
                    "files",
                    (
                        "photo.jpg",
                        (ROOT / "demo/public/samples/webcam-photo.jpg").read_bytes(),
                        "image/jpeg",
                    ),
                ),
            ],
            headers=HEADERS,
        )
        client.post(f"/api/projects/{pid}/analyze", json={"sample_interval": 1}, headers=HEADERS)
        project = wait_job(client, pid)
        target = project["people"][0]
        for other in project["people"][1:]:
            response = client.post(
                f"/api/projects/{pid}/people/{target['id']}/merge",
                json={"other_id": other["id"]},
                headers=HEADERS,
            )
            assert response.status_code == 200
        project = client.get(f"/api/projects/{pid}").json()
        target = project["people"][0]
        confirm(client, project, target)
        base = f"/api/projects/{pid}/people/{target['id']}"
        segments = client.get(base + "/segments").json()
        late = next(s for s in segments if s["kind"] == "video" and s["start"] >= 4)
        early = next(s for s in segments if s["kind"] == "video" and s["start"] == 0)
        photo = next(s for s in segments if s["kind"] == "image")
        selected = [late["id"], photo["id"], early["id"]]
        client.post(
            base + "/render",
            json={"segment_ids": selected, "preserve_audio": True},
            headers=HEADERS,
        )
        wait_job(client, pid)
        output = app.state.store.load(pid)["exports"][-1]
        assert output["preserve_audio"] and not output["muted"]
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
                    output["path"],
                ]
            )
        )
        streams = {s["codec_type"]: s for s in info["streams"]}
        assert streams["audio"]["sample_rate"] == "48000" and streams["audio"]["channels"] == 2
        assert abs(float(streams["audio"]["duration"]) - float(streams["video"]["duration"])) < 0.12
        audio = decoded_audio(output["path"])
        source_audio = decoded_audio(source)
        output_time = 0
        for segment in [late, photo, early]:
            duration = round(segment["duration"] * 12) / 12
            if segment["kind"] == "video":
                count = round((duration - 0.6) * 8000)
                source_start = round((segment["start"] + 0.3) * 8000)
                output_start = round((output_time + 0.3) * 8000)
                expected = source_audio[source_start : source_start + count]
                actual = audio[output_start : output_start + count]
                # A chirp disambiguates periodic tones: a 20 ms AAC padding shift
                # must not pass merely because the frequency still sounds right.
                correlation = max(
                    np.corrcoef(actual[2:-2], expected[2 + shift : count - 2 + shift])[0, 1]
                    for shift in range(-2, 3)
                )
                assert correlation > 0.95
            output_time += duration
        assert abs(dominant(audio, 0.2, 0.8) - 880) < 4
        boundary = round(late["duration"] * 12) / 12
        assert (
            float(np.abs(audio[int((boundary + 0.3) * 8000) : int((boundary + 2.6) * 8000)]).max())
            < 0.003
        )
        assert abs(dominant(audio, boundary + 3.3, boundary + 3.8) - 440) < 4
        client.post(
            base + "/render",
            json={"segment_ids": selected, "preserve_audio": False},
            headers=HEADERS,
        )
        wait_job(client, pid)
        muted = app.state.store.load(pid)["exports"][-1]
        assert muted["muted"] and float(np.abs(decoded_audio(muted["path"])).max()) < 0.001
