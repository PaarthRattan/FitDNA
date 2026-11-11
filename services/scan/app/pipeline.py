"""The scan pipeline: two photos and a height in, measurements and a faceless avatar out.

    reconstruct each view (SAM 3D Body on GPU, see recon.py)
    → check one person, front facing / right side, arms away from the body
    → fit one shared body to both views with the height and a statistics prior (refine.py)
    → measure the canonical body at the stated height (body/measure.py)
    → calibrated ranges and confidences (uncertainty.py)
    → avatar GLB at LOD 3 (body/export.py)

Everything runs in memory inside one request. Images are never written or logged.
"""

import base64
import time
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np

from .schema import PIPELINE_VERSION, BodyShape, ScanResult
from .stats.prior import predict
from .uncertainty import report
from .validate import Rejected, Upload

# Front: shoulders square to the camera within this angle. Side: shoulder line within this angle of the camera axis.
FRONT_MAX_TURN_DEG = 25.0
SIDE_MAX_TURN_DEG = 30.0
# Upper arm away from the torso, in degrees (A-pose).
ARM_ABDUCTION_DEG = (15.0, 55.0)


@dataclass
class ViewEstimate:
    """One photo's reconstruction. Joints are in camera coordinates (cm; x right, y down, z away from the camera)."""

    persons: int
    coeffs: np.ndarray  # (20,) body identity coefficients
    scales: dict[str, float]  # body skeleton scales
    joints_cam: dict[str, np.ndarray]  # at least l/r_uparm, l/r_lowarm, root, c_neck
    extras: dict = field(
        default_factory=dict
    )  # model-specific (pose parameters, camera, keypoints, mask) for refinement


class Reconstructor(Protocol):
    def reconstruct(self, image: np.ndarray) -> ViewEstimate: ...


class Refiner(Protocol):
    def fit(
        self, front: ViewEstimate, side: ViewEstimate, height_cm: float, prior: dict
    ) -> tuple[np.ndarray, dict[str, float]]: ...


class Measurer(Protocol):
    def measure(self, coeffs: np.ndarray, scales: dict[str, float], height_cm: float) -> dict[str, float]: ...

    def avatar(self, coeffs: np.ndarray, scales: dict[str, float], height_cm: float) -> bytes: ...


def _angle_deg(a: np.ndarray, b: np.ndarray) -> float:
    cos = float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))


def shoulder_turn_deg(joints: dict[str, np.ndarray]) -> float:
    """0 when the shoulder line is square to the camera, 90 when it points at the camera."""
    s = joints["l_uparm"] - joints["r_uparm"]
    return float(np.degrees(np.arcsin(min(1.0, abs(s[2]) / np.linalg.norm(s)))))


def arm_abduction_deg(joints: dict[str, np.ndarray], side: str) -> float:
    down = joints["root"] - joints["c_neck"]
    upper = joints[f"{side}_lowarm"] - joints[f"{side}_uparm"]
    return _angle_deg(upper, down)


def check_front(view: ViewEstimate) -> None:
    if view.persons == 0:
        raise Rejected("no_person")
    if view.persons > 1:
        raise Rejected("multiple_people")
    j = view.joints_cam
    if shoulder_turn_deg(j) > FRONT_MAX_TURN_DEG:
        raise Rejected("pose_front")
    lo, hi = ARM_ABDUCTION_DEG
    if not all(lo <= arm_abduction_deg(j, s) <= hi for s in ("l", "r")):
        raise Rejected("pose_front")


def check_side(view: ViewEstimate) -> None:
    if view.persons == 0:
        raise Rejected("no_person")
    if view.persons > 1:
        raise Rejected("multiple_people")
    j = view.joints_cam
    if 90.0 - shoulder_turn_deg(j) > SIDE_MAX_TURN_DEG:
        raise Rejected("pose_side")
    # The right side faces the camera: the right shoulder is the nearer one.
    if j["r_uparm"][2] >= j["l_uparm"][2]:
        raise Rejected("pose_side")


def merge(front: ViewEstimate, side: ViewEstimate) -> tuple[np.ndarray, dict[str, float]]:
    """Without refinement: the two views' shapes averaged."""
    coeffs = (np.asarray(front.coeffs) + np.asarray(side.coeffs)) / 2
    names = set(front.scales) | set(side.scales)
    scales = {n: (front.scales.get(n, 0.0) + side.scales.get(n, 0.0)) / 2 for n in names}
    return coeffs, scales


@dataclass
class Pipeline:
    reconstructor: Reconstructor
    measurer: Measurer
    refiner: Refiner | None = None
    clock: callable = time.monotonic

    def run(self, upload: Upload, deadline: float) -> ScanResult:
        def in_time() -> None:
            if self.clock() > deadline:
                raise Rejected("timeout")

        fields = upload.fields
        if hasattr(self.reconstructor, "height_cm"):
            self.reconstructor.height_cm = fields.height_cm  # places the starting camera
        front = self.reconstructor.reconstruct(upload.front)
        check_front(front)
        in_time()
        side = self.reconstructor.reconstruct(upload.side)
        check_side(side)
        in_time()

        prior = predict(fields.height_cm, fields.weight_kg, fields.age, fields.sex)
        if self.refiner is not None:
            coeffs, scales = self.refiner.fit(front, side, fields.height_cm, prior)
        else:
            coeffs, scales = merge(front, side)
        in_time()

        raw = self.measurer.measure(coeffs, scales, fields.height_cm)
        front_only = self.measurer.measure(front.coeffs, front.scales, fields.height_cm)
        side_only = self.measurer.measure(side.coeffs, side.scales, fields.height_cm)
        disagreement = {k: abs(front_only[k] - side_only[k]) for k in raw if k in front_only and k in side_only}
        loose = bool(front.extras.get("loose_clothing") or side.extras.get("loose_clothing"))
        measurements = report(raw, disagreement, loose)
        in_time()

        glb = self.measurer.avatar(coeffs, scales, fields.height_cm)
        return ScanResult(
            pipeline_version=PIPELINE_VERSION,
            measurements=measurements,
            body_shape=BodyShape(
                layout="mhr-1.0.1/body20+scales",
                coeffs=[round(float(c), 5) for c in coeffs],
                scales={k: round(float(v), 5) for k, v in sorted(scales.items())},
            ),
            glb_base64=base64.b64encode(glb).decode(),
            flags=sorted({f for m in measurements.values() for f in m.flags}),
        )


class MhrMeasurer:
    """Measures with MHR LOD 1 at the stated height; exports the avatar at LOD 3. Needs the `body` extra."""

    def measure(self, coeffs, scales, height_cm: float) -> dict[str, float]:
        from .body.measure import measure, scaled
        from .body.model import load

        body = load(1).geometry(coeffs, scales)
        stature = float(body.vertices[:, 1].max() - body.vertices[:, 1].min())
        return measure(scaled(body, height_cm / stature))

    def avatar(self, coeffs, scales, height_cm: float) -> bytes:
        from .body.export import mannequin_glb

        return mannequin_glb(coeffs, scales, height_cm)
