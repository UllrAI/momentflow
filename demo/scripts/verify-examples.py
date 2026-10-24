"""Verify bundled real films and align classroom audio against the included input."""

import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "demo/public"


def audio(path):
    result = subprocess.run(
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
    assert not result.stderr, result.stderr.decode()
    return np.frombuffer(result.stdout, dtype="<f4")


def alignment(reference, sample):
    scores = []
    for lag in range(-240, 241):
        a = reference[max(0, lag) : min(len(reference), len(sample) + lag)]
        b = sample[max(0, -lag) : min(len(sample), len(reference) - lag)]
        a, b = a - a.mean(), b - b.mean()
        scores.append(float(np.dot(a, b) / max(1e-12, np.linalg.norm(a) * np.linalg.norm(b))))
    best = int(np.argmax(scores))
    return {"correlation": round(scores[best], 6), "offset_ms": (best - 240) / 8}


def verify():
    catalog = json.loads((PUBLIC / "examples/catalog.json").read_text())
    report = []
    for activity in catalog:
        source = (
            audio(PUBLIC / activity["source"].lstrip("/"))
            if activity["source"].startswith("/")
            else None
        )
        for person in activity["people"]:
            for locale, version in person["versions"].items():
                path = PUBLIC / version["movie"].lstrip("/")
                metadata = json.loads(
                    subprocess.check_output(
                        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(path)]
                    )
                )
                streams = {stream["codec_type"]: stream for stream in metadata["streams"]}
                assert (
                    streams["video"]["codec_name"] == "h264"
                    and streams["audio"]["codec_name"] == "aac"
                )
                assert abs(float(streams["video"]["duration"]) - version["duration"]) < 0.09
                assert abs(float(streams["audio"]["duration"]) - version["duration"]) < 0.04
                output = audio(path)
                chapters = []
                if source is not None:
                    for index, chapter in enumerate(version["chapters"]):
                        end = (
                            version["chapters"][index + 1]["start"]
                            if index + 1 < len(version["chapters"])
                            else version["duration"]
                        )
                        length = min(3, end - chapter["start"] - 0.2)
                        assert length > 0
                        count = int(length * 8000)
                        original = int(
                            (chapter.get("original_start", chapter["source_start"]) + 0.1) * 8000
                        )
                        rendered = int((chapter["start"] + 0.1) * 8000)
                        result = alignment(
                            source[original : original + count], output[rendered : rendered + count]
                        )
                        # Classroom uses the exact uploaded input. Cooking's separate
                        # viewing encode is diagnostic; its exact-input validation
                        # remains in qa/real-activity/report.json.
                        if activity["id"] == "classroom":
                            assert (
                                result["correlation"] > 0.95 and abs(result["offset_ms"]) <= 25
                            ), (path, result)
                        chapters.append({"heading": chapter["heading"], **result})
                report.append(
                    {
                        "person": person["id"],
                        "locale": locale,
                        "file": version["movie"],
                        "duration": version["duration"],
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                        "decode_warnings": [],
                        "source_audio_matches": chapters,
                        "comparison_source": "uploaded_input"
                        if activity["id"] == "classroom"
                        else "separately_transcoded_viewing_copy; exact-input validation is in qa/real-activity/report.json",
                    }
                )
    target = ROOT / "demo/qa/classroom/audio-verification.json"
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        f"Verified {len(report)} films and classroom input audio; viewing-copy comparisons: {target.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    verify()
