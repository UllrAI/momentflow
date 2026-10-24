"""Fetch pinned OpenCV Zoo weights and verify their Git LFS SHA-256 checksums."""

import hashlib
import urllib.request
from pathlib import Path

REVISION = "48b10fa505aeb51fbd127fc60a5c660040e823b7"
MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
MODELS = {
    "face_detection_yunet_2023mar.onnx": (
        "face_detection_yunet",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "face_recognition_sface_2021dec.onnx": (
        "face_recognition_sface",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
}


def download():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, (folder, digest) in MODELS.items():
        target = MODEL_DIR / name
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == digest:
            print(f"Verified {name}")
            continue
        url = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/{REVISION}/models/{folder}/{name}"
        temp = target.with_suffix(".download")
        try:
            with urllib.request.urlopen(url, timeout=180) as response, temp.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            if hashlib.sha256(temp.read_bytes()).hexdigest() != digest:
                raise RuntimeError(f"Checksum mismatch: {name}")
            temp.replace(target)
            print(f"Downloaded and verified {name}")
        finally:
            temp.unlink(missing_ok=True)
    for folder in {entry[0] for entry in MODELS.values()}:
        url = f"https://raw.githubusercontent.com/opencv/opencv_zoo/{REVISION}/models/{folder}/LICENSE"
        (MODEL_DIR / f"{folder}.LICENSE").write_bytes(
            urllib.request.urlopen(url, timeout=30).read()
        )


if __name__ == "__main__":
    download()
