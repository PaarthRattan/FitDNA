"""Body measurements from a mesh in its canonical standing pose, defined the way FitDNA's tape form asks for them.

Coordinates are centimetres, Y up, X to the body's left, Z forward (MHR's convention). Definitions
(after ISO 8559-1, adapted to what the fit engine compares):

- chest: largest tape girth of the torso (arms excluded) in a window below the shoulder joints:
  "around the fullest part of your chest, just under your arms".
- shoulder: across the back from one shoulder point to the other, over the base of the neck,
  following the curve: "across your back, from the bony tip of one shoulder to the other".
- shoulder_biacromial: the straight distance between the two shoulder points (what ANSUR measures).
- arm: shoulder point to elbow to wrist: "from the bony tip of your shoulder, down the outside of a
  slightly bent arm, to your wrist bone". Averaged over both arms.
- waist: smallest torso girth between the ribs and the pelvis.
- hip: largest girth over the buttocks (torso and upper legs together, as a tape bridges them).

Window positions are fractions of stature, so they scale with the body.
"""

from dataclasses import dataclass

import numpy as np

from .geometry import arc_between, faces_within, girth_profile

REGIONS = ("torso", "neck", "head", "arm_l", "arm_r", "hand_l", "hand_r", "leg_l", "leg_r")


@dataclass(frozen=True)
class BodyGeometry:
    vertices: np.ndarray  # (V, 3) cm
    faces: np.ndarray  # (F, 3)
    region: np.ndarray  # (V,) index into REGIONS
    joints: dict[str, np.ndarray]  # name -> (3,) cm; needs l/r_uparm, l/r_lowarm, l/r_wrist, root, c_neck


@dataclass(frozen=True)
class Landmarks:
    shoulder_l: np.ndarray
    shoulder_r: np.ndarray
    back_neck: np.ndarray


def _mask(body: BodyGeometry, *names: str) -> np.ndarray:
    return np.isin(body.region, [REGIONS.index(n) for n in names])


def stature(body: BodyGeometry) -> float:
    return float(body.vertices[:, 1].max() - body.vertices[:, 1].min())


def shoulder_point(body: BodyGeometry, side: str) -> np.ndarray:
    """The lateral tip of the shoulder's upper surface (acromion, as a tape finds it).

    The most lateral point of the shoulder cap that is clearly above the shoulder joint
    (by 1.7% of stature, about 3 cm), in the joint's front-to-back band. Taking the highest point
    instead lands medially on a sloping shoulder and under-reads width by several centimetres.
    """
    joint = body.joints[f"{side}_uparm"]
    v = body.vertices
    lateral = 1.0 if side == "l" else -1.0
    near = (
        _mask(body, "torso", "neck", f"arm_{side}")
        & (np.abs(v[:, 2] - joint[2]) < 4.0)
        & (v[:, 1] > joint[1] + 0.017 * stature(body))
        & (v[:, 0] * lateral > 0)
    )
    if not near.any():
        raise ValueError(f"no shoulder surface above the {side} shoulder joint")
    candidates = v[near]
    return candidates[(candidates[:, 0] * lateral).argmax()]


def back_neck_point(body: BodyGeometry) -> np.ndarray:
    """Most posterior midline point at the base of the neck (around C7)."""
    neck = body.joints["c_neck"]
    v = body.vertices
    # A narrow band at the neck joint's height: a wider one reaches down onto the upper back,
    # whose bulge is further back, and tilts the measuring plane.
    near = _mask(body, "torso", "neck") & (np.abs(v[:, 0]) < 1.5) & (np.abs(v[:, 1] - neck[1]) < 1.5)
    if not near.any():
        raise ValueError("no back-of-neck surface found")
    candidates = v[near]
    return candidates[candidates[:, 2].argmin()]


def landmarks(body: BodyGeometry) -> Landmarks:
    return Landmarks(shoulder_point(body, "l"), shoulder_point(body, "r"), back_neck_point(body))


def measure(body: BodyGeometry) -> dict[str, float]:
    """All measurements in cm, rounded to 0.1."""
    height = stature(body)
    y_shoulder = (body.joints["l_uparm"][1] + body.joints["r_uparm"][1]) / 2
    y_root = body.joints["root"][1]
    torso_faces = faces_within(body.faces, _mask(body, "torso"))
    hip_faces = faces_within(body.faces, _mask(body, "torso", "leg_l", "leg_r"))
    upper_faces = faces_within(body.faces, _mask(body, "torso", "neck"))

    chest = girth_profile(body.vertices, torso_faces, y_shoulder - 0.035 * height, y_shoulder - 0.14 * height)
    waist = girth_profile(body.vertices, torso_faces, y_root + 0.06 * height, y_root + 0.16 * height)
    hip = girth_profile(body.vertices, hip_faces, y_root - 0.09 * height, y_root + 0.02 * height)
    waist_values = waist[waist[:, 1] > 0, 1]

    marks = landmarks(body)
    shoulder_arc = arc_between(body.vertices, upper_faces, marks.shoulder_l, marks.shoulder_r, marks.back_neck)

    def arm(side: str, shoulder: np.ndarray) -> float:
        elbow, wrist = body.joints[f"{side}_lowarm"], body.joints[f"{side}_wrist"]
        return float(np.linalg.norm(elbow - shoulder) + np.linalg.norm(wrist - elbow))

    out = {
        "stature": height,
        "chest": float(chest[:, 1].max()),
        "waist": float(waist_values.min()) if len(waist_values) else 0.0,
        "hip": float(hip[:, 1].max()),
        "shoulder": shoulder_arc,
        "shoulder_biacromial": float(np.linalg.norm(marks.shoulder_l - marks.shoulder_r)),
        "arm": (arm("l", marks.shoulder_l) + arm("r", marks.shoulder_r)) / 2,
    }
    return {k: round(v, 1) for k, v in out.items()}


def scaled(body: BodyGeometry, factor: float) -> BodyGeometry:
    """The same body scaled uniformly about the floor point under the root (to match a stated height)."""
    origin = np.array([body.joints["root"][0], body.vertices[:, 1].min(), body.joints["root"][2]])
    return BodyGeometry(
        vertices=origin + (body.vertices - origin) * factor,
        faces=body.faces,
        region=body.region,
        joints={k: origin + (p - origin) * factor for k, p in body.joints.items()},
    )
