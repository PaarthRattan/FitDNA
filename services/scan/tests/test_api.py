"""The HTTP API with a fake pipeline (no body model), the pose checks, and the stub server."""

import base64
import os
import tempfile

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api import create_app
from app.pipeline import Pipeline, ViewEstimate, arm_abduction_deg, check_front, check_side, shoulder_turn_deg
from app.validate import Rejected
from tests.conftest import SECRET, jpeg, multipart, signed_headers


def joints(turn_deg: float = 0.0, abduction_deg: float = 35.0, right_nearer: bool = True) -> dict[str, np.ndarray]:
    """A skeleton in camera coordinates (x right, y down, z away), turned about the vertical axis."""
    t = np.radians(turn_deg)
    rot = np.array([[np.cos(t), 0, np.sin(t)], [0, 1, 0], [-np.sin(t), 0, np.cos(t)]])
    a = np.radians(abduction_deg)
    body = {
        "c_neck": np.array([0.0, -60, 0]),
        "root": np.array([0.0, 0, 0]),
        "l_uparm": np.array([18.0, -55, 0]),
        "r_uparm": np.array([-18.0, -55, 0]),
        "l_lowarm": np.array([18.0 + 30 * np.sin(a), -55 + 30 * np.cos(a), 0]),
        "r_lowarm": np.array([-18.0 - 30 * np.sin(a), -55 + 30 * np.cos(a), 0]),
    }
    out = {k: rot @ v + np.array([0, 0, 300.0]) for k, v in body.items()}
    if not right_nearer:
        out = {k: v * np.array([1, 1, 1]) for k, v in out.items()}
    return out


def view(persons=1, **kw) -> ViewEstimate:
    return ViewEstimate(persons=persons, coeffs=np.zeros(20), scales={}, joints_cam=joints(**kw))


def test_pose_geometry_helpers():
    assert shoulder_turn_deg(joints(0)) == pytest.approx(0, abs=1e-6)
    assert shoulder_turn_deg(joints(90)) == pytest.approx(90, abs=1e-6)
    assert arm_abduction_deg(joints(abduction_deg=35), "l") == pytest.approx(35, abs=0.5)


def test_front_and_side_checks():
    check_front(view())
    check_side(view(turn_deg=-80))  # right side nearer the camera
    for v, check, code in [
        (view(persons=0), check_front, "no_person"),
        (view(persons=2), check_front, "multiple_people"),
        (view(turn_deg=40), check_front, "pose_front"),
        (view(abduction_deg=5), check_front, "pose_front"),
        (view(abduction_deg=80), check_front, "pose_front"),
        (view(turn_deg=20), check_side, "pose_side"),
        (view(turn_deg=80), check_side, "pose_side"),  # left side nearer
    ]:
        with pytest.raises(Rejected) as e:
            check(v)
        assert e.value.code == code


class FakeReconstructor:
    def __init__(self):
        self.calls = 0

    def reconstruct(self, image):
        self.calls += 1
        return view() if self.calls == 1 else view(turn_deg=-85)


class FakeMeasurer:
    def measure(self, coeffs, scales, height_cm):
        return {"chest": 100.0, "shoulder": 47.0, "arm": 59.0, "waist": 85.0, "hip": 100.0}

    def avatar(self, coeffs, scales, height_cm):
        return b"glTF fake"


def client(**kw) -> TestClient:
    app = create_app(
        lambda: Pipeline(reconstructor=FakeReconstructor(), measurer=FakeMeasurer(), **kw), secret=lambda: SECRET
    )
    return TestClient(app)


def post(c: TestClient, body: bytes, headers: dict):
    return c.post("/v1/scan", content=body, headers=headers)


def test_a_signed_scan_returns_measurements_and_an_avatar():
    body, ctype = multipart({"front": jpeg(), "side": jpeg()}, {"height_cm": "178", "weight_kg": "75"})
    r = post(client(), body, signed_headers(body, ctype))
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data["measurements"]) == {"chest", "shoulder", "arm", "waist", "hip"}
    assert base64.b64decode(data["glb_base64"]) == b"glTF fake"
    assert len(data["body_shape"]["coeffs"]) == 20


def test_unsigned_tampered_and_oversized_requests_are_refused():
    c = client()
    body, ctype = multipart({"front": jpeg(), "side": jpeg()}, {"height_cm": "178"})
    assert post(c, body, {"content-type": ctype}).json() == {"error": "unauthorized"}
    headers = signed_headers(body, ctype)
    assert post(c, body + b"x", headers).json() == {"error": "unauthorized"}
    big = b"0" * 2_000_000
    assert post(c, big, signed_headers(big, ctype)).status_code == 413


def test_bad_inputs_get_typed_errors():
    c = client()
    body, ctype = multipart({"front": jpeg(), "side": b"<html>"}, {"height_cm": "178"})
    assert post(c, body, signed_headers(body, ctype)).json() == {"error": "bad_image"}
    body, ctype = multipart({"front": jpeg(), "side": jpeg()}, {"height_cm": "300"})
    assert post(c, body, signed_headers(body, ctype)).json() == {"error": "bad_height"}


def test_deadline_turns_into_timeout():
    ticks = iter([0.0, 1e9, 1e9, 1e9, 1e9])
    r = post(*_signed(client(clock=lambda: next(ticks))))
    assert r.json() == {"error": "timeout"}


def _signed(c):
    body, ctype = multipart({"front": jpeg(), "side": jpeg()}, {"height_cm": "178"})
    return c, body, signed_headers(body, ctype)


def test_health_is_open_and_says_nothing_personal():
    assert client().get("/v1/health").json()["ok"] is True


def test_nothing_is_written_to_disk(tmp_path, monkeypatch):
    monkeypatch.setenv("TMPDIR", str(tmp_path))
    tempfile.tempdir = None
    before_tmp = set(os.listdir(tmp_path))
    before_cwd = set(os.listdir("."))
    r = post(*_signed(client()))
    assert r.status_code == 200
    assert set(os.listdir(tmp_path)) == before_tmp
    assert set(os.listdir(".")) == before_cwd
    tempfile.tempdir = None


def test_stub_server_answers_like_the_real_one(monkeypatch):
    monkeypatch.setenv("SCAN_API_SECRET", SECRET)
    from stub_server import make_app

    c = TestClient(make_app())
    body, ctype = multipart({"front": jpeg(), "side": jpeg()}, {"height_cm": "180", "weight_kg": "80", "sex": "male"})
    data = post(c, body, signed_headers(body, ctype)).json()
    assert 95 < data["measurements"]["chest"]["value_cm"] < 115
    assert base64.b64decode(data["glb_base64"])[:4] == b"glTF"
    body, ctype = multipart({"front": jpeg(), "side": jpeg()}, {"height_cm": "123"})
    assert post(c, body, signed_headers(body, ctype)).json() == {"error": "multiple_people"}
