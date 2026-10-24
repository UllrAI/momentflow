"""Keep the module-level ASGI app away from the user's live runtime during collection."""

import os
import tempfile

_original = os.environ.get("MOMENTFLOW_DATA_DIR")
_runtime = tempfile.TemporaryDirectory(prefix="momentflow-tests-")
os.environ["MOMENTFLOW_DATA_DIR"] = _runtime.name


def pytest_unconfigure(config):
    _runtime.cleanup()
    if _original is None:
        os.environ.pop("MOMENTFLOW_DATA_DIR", None)
    else:
        os.environ["MOMENTFLOW_DATA_DIR"] = _original
