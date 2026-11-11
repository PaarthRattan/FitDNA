"""Two-view refinement on synthetic bodies (MHR on CPU). The check on real photos is the validation study (M6d)."""

import numpy as np
import pytest

pytestmark = pytest.mark.mhr

PARTS = ("chest", "shoulder", "arm")


def test_refinement_recovers_known_bodies_from_two_views():
    from app.body.model import load
    from app.pipeline import MhrMeasurer
    from app.refine import Refiner, RefineSettings
    from app.synthetic import front_camera, observe, random_body, side_camera

    settings = RefineSettings()
    model = load(settings.lod)
    refiner = Refiner(settings, model=model)
    measurer = MhrMeasurer()
    before, after = [], []
    for seed in (3, 8, 21):
        rng = np.random.default_rng(seed)
        body = random_body(model, rng)
        height = float(np.ptp(load(1).geometry(body.coeffs, body.scales).vertices[:, 1]))
        views = [
            observe(model, body, c, rng, keypoint_noise_px=2.0, camera_noise_cm=4.0)
            for c in (front_camera(), side_camera())
        ]
        truth = measurer.measure(body.coeffs, body.scales, height)
        start = measurer.measure(np.zeros(20), {}, height)
        coeffs, scales, _ = refiner.fit(views, height)
        fitted = measurer.measure(coeffs, scales, height)
        before.append([abs(start[p] - truth[p]) for p in PARTS])
        after.append([abs(fitted[p] - truth[p]) for p in PARTS])
    before, after = np.array(before), np.array(after)
    chest, shoulder, arm = after.mean(axis=0)
    assert chest < before[:, 0].mean()  # refinement beats the average body on chest
    assert chest <= 2.0 and shoulder <= 2.0 and arm <= 1.5
    assert after.max() <= 4.0


def test_a_view_without_a_mask_still_fits_from_keypoints():
    from app.body.model import load
    from app.refine import Refiner, RefineSettings
    from app.synthetic import front_camera, observe, random_body, side_camera

    model = load(3)
    rng = np.random.default_rng(5)
    body = random_body(model, rng)
    views = [observe(model, body, c, rng) for c in (front_camera(), side_camera())]
    views[1].mask = None
    coeffs, scales, terms = Refiner(RefineSettings(iterations=20), model=model).fit(views, 175.0)
    assert coeffs.shape == (20,) and len(scales) == 13 and np.isfinite(list(terms.values())).all()
