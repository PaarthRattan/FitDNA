"""A stand-in scan service for web development and end-to-end tests. No GPU, no body model, no weights.

    uv run python stub_server.py --port 8787          # SCAN_API_SECRET must match the web app's

Same API, same signing, same validation as the real service. The "reconstruction" ignores the
photos: measurements come from the statistics model for the given height/weight/age/sex, and the
avatar is a mannequin made of primitive shapes.

Reserved heights simulate failures, so the web app's error paths can be exercised:
    121 cm -> pose_front    122 cm -> pose_side    123 cm -> multiple_people
    124 cm -> no_person     125 cm -> failed       126 cm -> sleeps 20 s first
"""

import argparse
import time

import numpy as np
import trimesh
import uvicorn

from app.api import create_app
from app.body.export import glb_bytes
from app.pipeline import Pipeline, ViewEstimate
from app.stats.prior import predict
from app.validate import Rejected, Upload

FAILURES = {121: "pose_front", 122: "pose_side", 123: "multiple_people", 124: "no_person", 125: "failed"}


def _mannequin(height_cm: float) -> bytes:
    h = height_cm
    parts = [
        trimesh.creation.capsule(height=0.30 * h, radius=0.11 * h, count=[16, 16]),  # torso
        trimesh.creation.icosphere(subdivisions=3, radius=0.065 * h),  # generic head
    ]
    parts[0].apply_translation([0, 0, 0.62 * h])
    parts[1].apply_translation([0, 0, 0.93 * h])
    for side in (-1, 1):
        arm = trimesh.creation.capsule(height=0.30 * h, radius=0.03 * h, count=[12, 12])
        arm.apply_transform(trimesh.transformations.rotation_matrix(np.radians(side * 30), [0, 1, 0]))
        arm.apply_translation([side * 0.16 * h, 0, 0.66 * h])
        leg = trimesh.creation.capsule(height=0.42 * h, radius=0.05 * h, count=[12, 12])
        leg.apply_translation([side * 0.06 * h, 0, 0.25 * h])
        parts += [arm, leg]
    mesh = trimesh.util.concatenate(parts)
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.radians(-90), [1, 0, 0]))  # Z-up to Y-up
    return glb_bytes(mesh.vertices, mesh.faces)


class StubReconstructor:
    def reconstruct(self, image: np.ndarray) -> ViewEstimate:
        raise NotImplementedError  # StubPipeline.run doesn't reconstruct


class StubMeasurer:
    def measure(self, coeffs, scales, height_cm):
        return {}

    def avatar(self, coeffs, scales, height_cm):
        return _mannequin(height_cm)


class StubPipeline(Pipeline):
    def run(self, upload: Upload, deadline: float):
        from app.schema import PIPELINE_VERSION, BodyShape, ScanResult
        from app.uncertainty import report

        f = upload.fields
        code = FAILURES.get(round(f.height_cm))
        if code == "failed":
            raise RuntimeError("simulated failure")
        if code:
            raise Rejected(code)
        if round(f.height_cm) == 126:
            time.sleep(20)
        estimate = predict(f.height_cm, f.weight_kg, f.age, f.sex)
        raw = {k: e.value_cm for k, e in estimate.items() if k in ("chest", "shoulder", "arm", "waist", "hip")}
        measurements = report(raw, disagreement={"chest": 1.2, "shoulder": 0.4, "arm": 0.6, "waist": 1.5, "hip": 1.1})
        import base64

        return ScanResult(
            pipeline_version=f"stub|{PIPELINE_VERSION}",
            measurements=measurements,
            body_shape=BodyShape(layout="mhr-1.0.1/body20+scales", coeffs=[0.0] * 20, scales={}),
            glb_base64=base64.b64encode(self.measurer.avatar(None, None, f.height_cm)).decode(),
            flags=sorted({flag for m in measurements.values() for flag in m.flags}),
        )


def make_app():
    return create_app(lambda: StubPipeline(reconstructor=StubReconstructor(), measurer=StubMeasurer()))


app = make_app()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
