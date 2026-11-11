"""M6b check on synthetic bodies: does two-view refinement recover known measurements? No real people.

    uv run python -m evals.synthetic_refine --bodies 20 [--lod 4] [--iterations 300]

For each random MHR body: render a front and a right-side view (exact silhouettes, joints with
2 px noise, cameras off by 4 cm), refine from the average body, and compare chest, shoulder and
arm against the truth. Prints per-body errors and the mean absolute error before and after.
This shows the optimiser can recover a body the model can represent; it says nothing about
real photos, clothing or segmentation errors, which only the validation study can measure.
"""

import argparse
import time

import numpy as np

from app.body.model import load
from app.pipeline import MhrMeasurer
from app.refine import Refiner, RefineSettings
from app.synthetic import front_camera, observe, random_body, side_camera

PARTS = ("chest", "shoulder", "arm", "waist", "hip")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bodies", type=int, default=20)
    parser.add_argument("--lod", type=int, default=4)
    parser.add_argument("--iterations", type=int, default=300)
    parser.add_argument("--spread", type=float, default=1.0)
    args = parser.parse_args()

    model = load(args.lod)
    refiner = Refiner(RefineSettings(iterations=args.iterations, lod=args.lod), model=model)
    measurer = MhrMeasurer()
    before, after, seconds = [], [], []
    for seed in range(args.bodies):
        rng = np.random.default_rng(1000 + seed)
        body = random_body(model, rng, spread=args.spread)
        height = float(np.ptp(load(1).geometry(body.coeffs, body.scales).vertices[:, 1]))
        views = [
            observe(model, body, c, rng, keypoint_noise_px=2.0, camera_noise_cm=4.0)
            for c in (front_camera(), side_camera())
        ]
        truth = measurer.measure(body.coeffs, body.scales, height)
        start = measurer.measure(np.zeros(20), {}, height)
        t = time.time()
        coeffs, scales, _ = refiner.fit(views, height)
        seconds.append(time.time() - t)
        fitted = measurer.measure(coeffs, scales, height)
        before.append([start[p] - truth[p] for p in PARTS])
        after.append([fitted[p] - truth[p] for p in PARTS])
        print(f"body {seed:2d}  " + "  ".join(f"{p} {a:+5.1f}" for p, a in zip(PARTS, after[-1], strict=True)))
    before, after = np.abs(np.array(before)), np.abs(np.array(after))
    print(f"\nLOD {args.lod}, {args.iterations} iterations, {args.bodies} bodies, {np.mean(seconds):.1f} s each")
    for i, p in enumerate(PARTS):
        start_mae, refined_mae, p90 = before[:, i].mean(), after[:, i].mean(), np.percentile(after[:, i], 90)
        print(f"{p:9} MAE start {start_mae:5.2f}  refined {refined_mae:5.2f}  P90 {p90:5.2f}")


if __name__ == "__main__":
    main()
