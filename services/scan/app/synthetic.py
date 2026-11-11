"""Synthetic two-view scans of known MHR bodies, for tests and the refinement evaluation. No real people.

A random body is posed at rest, seen by a front camera and a right-side camera; the observations
are its projected joints (with optional pixel noise) and an exact silhouette rasterised triangle by
triangle. Needs the `body` extra.
"""

from dataclasses import dataclass

import numpy as np
import torch
from PIL import Image, ImageDraw

from .body.model import BodyModel
from .refine import KEYPOINT_JOINTS, Camera, ViewObservation, _project

IMAGE_SIZE = (720, 1280)
FOCAL_PX = 1100.0


def front_camera(distance_cm: float = 300.0) -> Camera:
    """Looking at the body's front: camera x = body left (+x), camera y = down, camera z = towards the body."""
    return Camera(np.diag([1.0, -1.0, -1.0]), np.array([0.0, 92.0, distance_cm]), FOCAL_PX, 360.0, 640.0)


def side_camera(distance_cm: float = 300.0) -> Camera:
    """On the body's right, looking at its right side."""
    rotation = np.array([[0.0, 0.0, 1.0], [0.0, -1.0, 0.0], [1.0, 0.0, 0.0]])
    return Camera(rotation, np.array([0.0, 92.0, distance_cm]), FOCAL_PX, 360.0, 640.0)


@dataclass
class SyntheticBody:
    coeffs: np.ndarray
    scales: dict[str, float]


def random_body(
    model: BodyModel, rng: np.random.Generator, spread: float = 1.0, scale_sd: float = 0.04
) -> SyntheticBody:
    return SyntheticBody(rng.normal(0, spread, 20), {n: float(rng.normal(0, scale_sd)) for n in model.scale_names})


def observe(
    model: BodyModel,
    body: SyntheticBody,
    camera: Camera,
    rng: np.random.Generator | None = None,
    keypoint_noise_px: float = 0.0,
    camera_noise_cm: float = 0.0,
) -> ViewObservation:
    """What a perfect detector and segmenter would see, with the given noise; the returned camera carries the noise."""
    params = model.model_parameters(body.scales)
    with torch.no_grad():
        vertices, skeleton = model.forward(body.coeffs, model_parameters=params)
        rot = torch.as_tensor(camera.rotation, dtype=torch.float32)
        t = torch.as_tensor(camera.translation, dtype=torch.float32)
        pixels = _project(vertices, rot, t, camera).numpy()
        joints = {
            n: _project(skeleton[[model.joint_names.index(n)], :3], rot, t, camera)[0].numpy() for n in KEYPOINT_JOINTS
        }
    rng = rng or np.random.default_rng(0)
    keypoints = {
        n: (float(p[0] + rng.normal(0, keypoint_noise_px)), float(p[1] + rng.normal(0, keypoint_noise_px)), 1.0)
        for n, p in joints.items()
    }
    image = Image.new("1", IMAGE_SIZE, 0)
    draw = ImageDraw.Draw(image)
    for face in model.faces:
        draw.polygon([tuple(pixels[i]) for i in face], fill=1)
    noisy = Camera(
        camera.rotation, camera.translation + rng.normal(0, camera_noise_cm, 3), camera.focal_px, camera.cx, camera.cy
    )
    return ViewObservation(camera=noisy, image_size=IMAGE_SIZE, keypoints=keypoints, mask=np.array(image, dtype=bool))
