import hashlib
import io
import os
import time
import uuid
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.auth import sign

SECRET = "test-secret"  # noqa: S105 (a test fixture, not a credential)


def jpeg(width: int = 600, height: int = 900, color=(180, 160, 150)) -> bytes:
    """A plain test image. Never a real person."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def multipart(files: dict[str, bytes], fields: dict[str, str]) -> tuple[bytes, str]:
    boundary = "----fitdna" + uuid.uuid4().hex
    out = io.BytesIO()
    for name, value in fields.items():
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, data in files.items():
        out.write(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}.jpg"\r\n'
            f"Content-Type: image/jpeg\r\n\r\n".encode()
        )
        out.write(data + b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def signed_headers(body: bytes, content_type: str, scan_id: str | None = None, secret: str = SECRET, now=None) -> dict:
    scan_id = scan_id or str(uuid.uuid4())
    ts = int(now if now is not None else time.time())
    digest = hashlib.sha256(body).hexdigest()
    return {
        "content-type": content_type,
        "x-fitdna-timestamp": str(ts),
        "x-fitdna-scan-id": scan_id,
        "x-fitdna-content-sha256": digest,
        "x-fitdna-signature": sign(secret, ts, scan_id, digest),
    }


def mhr_available() -> bool:
    try:
        import mhr  # noqa: F401
    except ImportError:
        return False
    from app.body.model import assets_folder

    return Path(assets_folder(), "lod1.fbx").exists()


def pytest_collection_modifyitems(config, items):
    # A collection-time skip, so module-scoped fixtures (which load torch) never run without the model.
    if mhr_available():
        return
    skip = pytest.mark.skip(reason="MHR body model or assets not installed")
    for item in items:
        if item.get_closest_marker("mhr"):
            item.add_marker(skip)


@pytest.fixture
def secret_env(monkeypatch):
    monkeypatch.setenv("SCAN_API_SECRET", SECRET)
    return SECRET


def elliptic_cylinder(a: float, b: float, height: float = 10.0, n: int = 256, rings: int = 11):
    """(vertices, faces) of a closed-sided elliptic tube along Y."""
    theta = np.linspace(0, 2 * np.pi, n, endpoint=False)
    ys = np.linspace(0, height, rings)
    vertices = np.array([[a * np.cos(t), y, b * np.sin(t)] for y in ys for t in theta])
    faces = []
    for r in range(rings - 1):
        for i in range(n):
            p, q = r * n + i, r * n + (i + 1) % n
            faces += [[p, q, p + n], [q, q + n, p + n]]
    return vertices, np.array(faces)


os.environ.setdefault("PYTHONHASHSEED", "0")
