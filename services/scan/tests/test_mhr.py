"""Tests on the real MHR body model. Need `uv sync --extra body` and the assets; skipped otherwise (and in CI)."""

import numpy as np
import pytest

pytestmark = pytest.mark.mhr


@pytest.fixture(scope="module")
def model():
    from app.body.model import load

    return load(1)


def test_body_shape_never_includes_head_hands_or_face(model):
    assert len(model.scale_names) == 13
    assert not any(k in n for n in model.scale_names for k in ("eye", "thumb", "index", "hands"))
    identity = model.identity(np.ones(20))
    assert identity.shape == (1, 45) and float(identity[0, 20:].abs().sum()) == 0.0


def test_average_body_measures_in_adult_ranges(model):
    from app.body.measure import measure

    m = measure(model.geometry(np.zeros(20)))
    assert m["stature"] == pytest.approx(172.7, abs=0.2)
    assert 85 < m["chest"] < 120 and 70 < m["waist"] < 105 and 90 < m["hip"] < 120
    assert 36 < m["shoulder_biacromial"] < 46 and 42 < m["shoulder"] < 58 and 48 < m["arm"] < 64


def test_measurements_scale_with_the_body_and_are_symmetric(model):
    from app.body.measure import measure, scaled, shoulder_point

    g = model.geometry(np.random.default_rng(3).normal(0, 1, 20))
    a, b = measure(g), measure(scaled(g, 1.1))
    for k in ("chest", "waist", "hip", "shoulder", "arm"):
        assert b[k] == pytest.approx(a[k] * 1.1, rel=0.02)
    left, right = shoulder_point(g, "l"), shoulder_point(g, "r")
    assert left[0] == pytest.approx(-right[0], abs=0.05) and left[1] == pytest.approx(right[1], abs=0.05)


def test_skeleton_scales_act_on_their_own_part(model):
    from app.body.measure import measure

    base = measure(model.geometry(np.zeros(20)))
    wider = measure(model.geometry(np.zeros(20), {"scale_shoulder_width": 0.1}))
    longer = measure(model.geometry(np.zeros(20), {"scale_lowarms": 0.1}))
    assert wider["shoulder"] > base["shoulder"] and wider["waist"] == base["waist"]
    assert longer["arm"] > base["arm"] and longer["chest"] == base["chest"]


def test_lod3_avatar_is_small_and_the_same_body():
    from app.body.export import MAX_GLB_BYTES, mannequin_glb
    from app.body.measure import measure
    from app.body.model import load

    coeffs = np.random.default_rng(5).normal(0, 1, 20)
    glb = mannequin_glb(coeffs, {}, 180.0)
    assert glb[:4] == b"glTF" and len(glb) <= MAX_GLB_BYTES
    g1, g3 = load(1).geometry(coeffs), load(3).geometry(coeffs)
    # Same identity coefficients, same body: the skeleton is identical across levels of detail.
    for joint in ("l_uparm", "l_lowarm", "l_wrist", "root", "c_neck"):
        assert np.allclose(g1.joints[joint], g3.joints[joint], atol=0.5)
    # Surface measurements differ a little with tessellation (a coarse cross-section is a polygon
    # inside the curved surface; the shoulder point is the nearest coarse vertex), which is why
    # measurements always use LOD 1 and LOD 3 is only the picture.
    fine, coarse = measure(g1), measure(g3)
    assert coarse["stature"] == pytest.approx(fine["stature"], rel=0.01)
    assert coarse["chest"] == pytest.approx(fine["chest"], rel=0.05)


def test_mhr_measurer_hits_the_stated_height():
    from app.pipeline import MhrMeasurer

    m = MhrMeasurer().measure(np.zeros(20), {}, 185.0)
    assert m["stature"] == pytest.approx(185.0, abs=0.2)
