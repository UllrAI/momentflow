"""YuNet face detection, SFace embeddings and conservative complete-link clustering."""

import hashlib
import threading
import uuid

import cv2
import numpy as np

from .download_models import MODEL_DIR

MATCH_THRESHOLD = 0.45
AMBIGUITY_MARGIN = 0.06


def similarity(left, right):
    return float(np.dot(left, right))


def cooccurs(left, right):
    return (
        not left.get("reference")
        and not right.get("reference")
        and left["media_id"] == right["media_id"]
        and left["timestamp"] == right["timestamp"]
        and left["id"] != right["id"]
    )


def cluster_faces(faces, existing=None):
    """Never merge two distinct faces visible in the same sampled frame automatically."""
    groups = [dict(p, face_ids=list(p["face_ids"])) for p in (existing or [])]
    by_id = {f["id"]: f for f in faces}
    assigned = {fid for p in groups for fid in p["face_ids"]}
    for face in faces:
        if face["id"] in assigned or face.get("embedding") is None:
            continue
        candidates = []
        for group in groups:
            members = [by_id[fid] for fid in group["face_ids"] if fid in by_id]
            if any(cooccurs(face, member) for member in members):
                continue
            vectors = [member["embedding"] for member in members if member.get("embedding")]
            if not vectors:
                continue
            score = min(similarity(face["embedding"], vector) for vector in vectors)
            if score >= MATCH_THRESHOLD:
                candidates.append((score, group))
        candidates.sort(key=lambda item: item[0], reverse=True)
        ambiguous = len(candidates) > 1 and candidates[0][0] - candidates[1][0] < AMBIGUITY_MARGIN
        if candidates and not ambiguous:
            candidates[0][1]["face_ids"].append(face["id"])
            candidates[0][1]["confirmed"] = False
        else:
            groups.append(
                {
                    "id": str(uuid.uuid4()),
                    "name": f"待命名人物 {len(groups) + 1:02d}",
                    "face_ids": [face["id"]],
                    "confirmed": False,
                    "authorized": False,
                    "revision": 0,
                    "note": "",
                    "review_reason": "相近人物需人工核对" if ambiguous else "请核对人物身份",
                }
            )
    return groups


class FaceEngine:
    def __init__(self):
        detector_path = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
        recognizer_path = MODEL_DIR / "face_recognition_sface_2021dec.onnx"
        if not detector_path.exists() or not recognizer_path.exists():
            raise RuntimeError("识别模型尚未安装，请运行 npm run setup。")
        self.detector = cv2.FaceDetectorYN.create(
            str(detector_path), "", (640, 640), 0.88, 0.3, 5000
        )
        self.recognizer = cv2.FaceRecognizerSF.create(str(recognizer_path), "")
        self.lock = threading.Lock()

    def detect(self, frame, quality_gate=True):
        height, width = frame.shape[:2]
        factor = min(1.0, 960 / max(height, width))
        small = cv2.resize(frame, (int(width * factor), int(height * factor)))
        results = []
        with self.lock:
            self.detector.setInputSize((small.shape[1], small.shape[0]))
            _, rows = self.detector.detect(small)
            if rows is None and max(small.shape[:2]) > 640:
                factor = min(1.0, 640 / max(height, width))
                small = cv2.resize(frame, (int(width * factor), int(height * factor)))
                self.detector.setInputSize((small.shape[1], small.shape[0]))
                _, rows = self.detector.detect(small)
            if rows is None:
                return results
            for row in sorted(rows, key=lambda f: f[0]):
                x, y, w, h = row[:4] / factor
                x, y = max(0, int(x)), max(0, int(y))
                w, h = min(int(w), width - x), min(int(h), height - y)
                if w < 4 or h < 4:
                    continue
                crop = frame[y : y + h, x : x + w]
                sharpness = float(
                    cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()
                )
                reason = "人脸太小" if min(w, h) < 32 else "人脸模糊" if sharpness < 12 else ""
                feature = None
                if not quality_gate or not reason:
                    aligned = self.recognizer.alignCrop(small, row)
                    vector = self.recognizer.feature(aligned).flatten().copy()
                    norm = float(np.linalg.norm(vector))
                    if norm > 0:
                        feature = (vector / norm).tolist()
                results.append(
                    {
                        "bbox": [x, y, w, h],
                        "confidence": round(float(row[-1]), 4),
                        "sharpness": round(sharpness, 1),
                        "embedding": feature,
                        "quality_reason": reason,
                        "crop": crop,
                    }
                )
        return results


def face_id(media_id, timestamp, index):
    value = f"{media_id}:{timestamp:.3f}:{index}".encode()
    return hashlib.sha256(value).hexdigest()[:24]
