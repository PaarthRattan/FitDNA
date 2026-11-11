"""Per-photo reconstruction for the GPU service. NOT YET RUN: written against documented APIs only.

Each photo gives the pipeline a ViewEstimate:
- person count, 2D joints, 3D pose for the checks, and a person mask: MediaPipe Pose Landmarker
  (Apache-2.0; landmark indices and outputs are documented and stable);
- a starting body shape: SAM 3D Body (SAM License, weights gated on Hugging Face). Its docs don't
  state the size or meaning of `shape_params`; it's used only if it has MHR's 45 identity values,
  otherwise refinement starts from the average body (which tests show it recovers from);
- a starting camera: a pinhole at a nominal focal length, placed so the person's height in pixels
  matches the stated height. Refinement corrects it.

M6a checklist before trusting this on real photos: confirm `shape_params` is MHR's identity vector
(first 20 = body); confirm process_one_image takes an RGB array; time both models on the GPU.
"""

import sys
from dataclasses import dataclass

import numpy as np

from .pipeline import ViewEstimate
from .refine import Camera, ViewObservation

# MediaPipe Pose landmark indices (https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker).
# MediaPipe's "left" is the person's left, as is MHR's "l_".
MP = {
    "l_uparm": 11,
    "r_uparm": 12,
    "l_lowarm": 13,
    "r_lowarm": 14,
    "l_wrist": 15,
    "r_wrist": 16,
    "l_upleg": 23,
    "r_upleg": 24,
    "l_lowleg": 25,
    "r_lowleg": 26,
    "l_foot": 27,
    "r_foot": 28,
}
NOMINAL_FOV_DEG = 60.0  # long side; phone main cameras are roughly 60-70 degrees
FRONT_ROTATION = np.diag([1.0, -1.0, -1.0])
SIDE_ROTATION = np.array([[0.0, 0.0, 1.0], [0.0, -1.0, 0.0], [1.0, 0.0, 0.0]])


@dataclass
class PoseResult:
    persons: int
    keypoints_px: dict[str, tuple[float, float, float]]
    world_cm: dict[str, np.ndarray]
    mask: np.ndarray | None


class MediaPipePose:
    def __init__(self, model_path: str):
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python.core.base_options import BaseOptions

        self._mp = mp
        options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=2,
            output_segmentation_masks=True,
        )
        self.landmarker = vision.PoseLandmarker.create_from_options(options)

    def __call__(self, rgb: np.ndarray) -> PoseResult:
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = self.landmarker.detect(image)
        persons = len(result.pose_landmarks)
        if persons == 0:
            return PoseResult(0, {}, {}, None)
        h, w = rgb.shape[:2]
        lm, world = result.pose_landmarks[0], result.pose_world_landmarks[0]
        keypoints = {name: (lm[i].x * w, lm[i].y * h, float(lm[i].visibility or 0.0)) for name, i in MP.items()}
        # World landmarks: metres, origin between the hips; x right, y down, z away from the camera.
        world_cm = {name: np.array([world[i].x, world[i].y, world[i].z]) * 100 for name, i in MP.items()}
        world_cm["root"] = (world_cm["l_upleg"] + world_cm["r_upleg"]) / 2
        world_cm["c_neck"] = (world_cm["l_uparm"] + world_cm["r_uparm"]) / 2
        mask = None
        if result.segmentation_masks:
            mask = result.segmentation_masks[0].numpy_view()[..., 0] > 0.5
        return PoseResult(persons, keypoints, world_cm, mask)


def initial_camera(
    mask: np.ndarray | None, keypoints: dict, size: tuple[int, int], height_cm: float, side: bool
) -> Camera:
    w, h = size
    focal = max(w, h) / (2 * np.tan(np.radians(NOMINAL_FOV_DEG) / 2))
    if mask is not None and mask.any():
        ys, xs = np.nonzero(mask)
        top, bottom, cx = ys.min(), ys.max(), xs.mean()
    else:
        ys = [p[1] for p in keypoints.values()]
        top, bottom, cx = min(ys) - 0.12 * h, max(ys), np.mean([p[0] for p in keypoints.values()])
    pixel_height = max(bottom - top, 1.0)
    distance = focal * height_cm / pixel_height
    # Root (pelvis) at about 53% of height; place it where the body's middle is in the image.
    y_root_px = bottom - 0.53 * pixel_height
    t = np.array([(cx - w / 2) * distance / focal, (y_root_px - h / 2) * distance / focal, distance])
    t = t - (SIDE_ROTATION if side else FRONT_ROTATION) @ np.array([0.0, 0.53 * height_cm, 0.0])
    return Camera(SIDE_ROTATION if side else FRONT_ROTATION, t, focal, w / 2, h / 2)


class Sam3dBodyShape:
    """SAM 3D Body as a source of a starting shape only."""

    def __init__(self, repo_dir: str, hf_repo_id: str, device: str = "cuda"):
        sys.path.insert(0, repo_dir)
        from notebook.utils import setup_sam_3d_body  # repo-local helper (README)

        self.estimator = setup_sam_3d_body(hf_repo_id=hf_repo_id, device=device)

    def __call__(self, rgb: np.ndarray) -> np.ndarray | None:
        outputs = self.estimator.process_one_image(rgb)
        if len(outputs) != 1:
            return None
        shape = np.asarray(outputs[0].get("shape_params", []), dtype=np.float64).reshape(-1)
        return shape[:20] if shape.size == 45 else None


class Reconstructor:
    """Front and side photos, in that order, from one instance per request."""

    def __init__(self, pose: MediaPipePose, shape: Sam3dBodyShape | None):
        self.pose, self.shape = pose, shape
        self.height_cm: float | None = None  # set by the pipeline before reconstructing
        self._views = 0

    def reconstruct(self, rgb: np.ndarray) -> ViewEstimate:
        side = self._views == 1
        self._views += 1
        result = self.pose(rgb)
        if result.persons != 1:
            return ViewEstimate(persons=result.persons, coeffs=np.zeros(20), scales={}, joints_cam={})
        size = (rgb.shape[1], rgb.shape[0])
        coeffs = self.shape(rgb) if self.shape is not None else None
        observation = ViewObservation(
            camera=initial_camera(result.mask, result.keypoints_px, size, self.height_cm or 170.0, side),
            image_size=size,
            keypoints={k: v for k, v in result.keypoints_px.items() if v[2] > 0.5},
            mask=result.mask,
        )
        return ViewEstimate(
            persons=1,
            coeffs=coeffs if coeffs is not None else np.zeros(20),
            scales={},
            joints_cam=result.world_cm,
            extras={"observation": observation},
        )
