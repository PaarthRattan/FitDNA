"""Two-view refinement: one body that explains both photos, the stated height and the statistics prior.

SAM 3D Body reconstructs each photo on its own, and its body shape drifts towards the average.
This fits a single shared body shape (20 body coefficients and 13 skeleton scales) plus each
view's camera rotation and translation, holding each view's pose fixed, by gradient descent on:

    keypoints    2D joint positions in each photo (shoulders, elbows, wrists, hips, knees, ankles, neck)
    silhouette   each photo's person mask against the body's projected rim (contour matching, below)
    height       rest-pose stature against the stated height
    prior        straight shoulder breadth against the statistics prediction, and a pull to the average body

Silhouettes are matched by their outlines rather than rendered: every point on the mask's outline
pulls the nearest projected rim vertex (a vertex whose surface turns away from the camera), and rim
vertices that fall outside the mask are pushed back in along a distance map. A blurred rendering
(Gaussian splats) was tried first and biased bodies small, because blur moves a soft silhouette's
edge outward. This needs no mesh renderer, so it runs (and is tested) on CPU. Optimisation uses
MHR LOD 3 (4,899 vertices); the result is measured at LOD 1. Needs the `body` extra.
"""

from dataclasses import dataclass, field

import numpy as np
import torch
import torch.nn.functional as F
from scipy.ndimage import distance_transform_edt

from .body.model import BodyModel, load

KEYPOINT_JOINTS = (
    "c_neck",
    "l_uparm",
    "r_uparm",
    "l_lowarm",
    "r_lowarm",
    "l_wrist",
    "r_wrist",
    "l_upleg",
    "r_upleg",
    "l_lowleg",
    "r_lowleg",
    "l_foot",
    "r_foot",
)


@dataclass
class Camera:
    """Pinhole camera: p_cam = R @ p_world + t (cm); pixels = f * p_cam.xy / p_cam.z + (cx, cy)."""

    rotation: np.ndarray  # (3, 3)
    translation: np.ndarray  # (3,)
    focal_px: float
    cx: float
    cy: float


@dataclass
class ViewObservation:
    camera: Camera
    image_size: tuple[int, int]  # (width, height)
    keypoints: dict[str, tuple[float, float, float]] = field(default_factory=dict)  # joint -> (u, v, confidence)
    mask: np.ndarray | None = None  # (H, W) bool person silhouette
    model_parameters: np.ndarray | None = None  # (204,) the photo's pose; scales are replaced by the shared ones


@dataclass
class RefineSettings:
    iterations: int = 300
    lod: int = 3  # LOD 4 is 1.7x faster but recovers bodies less well (evals/synthetic_refine.py)
    contour_points: int = 400  # outline points sampled from each mask
    rim_cos: float = 0.25  # |cos| between a vertex normal and the line of sight below which it's on the rim
    # Every term is a negative log-likelihood: an error divided by its expected size.
    keypoint_px: float = 4.0  # 2D joint detector noise
    outline_px: float = 3.0  # mask outline noise
    height_cm: float = 1.0  # stated height
    scale_sd: float = 0.05  # skeleton scales' spread (body coefficients are standard normal)
    lr_shape: float = 0.05


def _rodrigues(rotvec: torch.Tensor) -> torch.Tensor:
    theta = torch.sqrt((rotvec * rotvec).sum() + 1e-12)
    k = rotvec / theta
    kx = torch.zeros(3, 3, dtype=rotvec.dtype)
    kx = kx.index_put(
        (torch.tensor([0, 0, 1, 1, 2, 2]), torch.tensor([1, 2, 0, 2, 0, 1])),
        torch.stack([-k[2], k[1], k[2], -k[0], -k[1], k[0]]),
    )
    return torch.eye(3) + torch.sin(theta) * kx + (1 - torch.cos(theta)) * (kx @ kx)


def _project(points: torch.Tensor, rot: torch.Tensor, t: torch.Tensor, cam: Camera) -> torch.Tensor:
    p = points @ rot.T + t
    z = p[:, 2].clamp(min=1.0)
    return torch.stack([cam.focal_px * p[:, 0] / z + cam.cx, cam.focal_px * p[:, 1] / z + cam.cy], dim=1)


def mask_outline(mask: np.ndarray, max_points: int) -> np.ndarray:
    """(N, 2) pixel coordinates (x, y) of the mask's outline, evenly subsampled."""
    m = mask.astype(bool)
    inner = m.copy()
    inner[1:, :] &= m[:-1, :]
    inner[:-1, :] &= m[1:, :]
    inner[:, 1:] &= m[:, :-1]
    inner[:, :-1] &= m[:, 1:]
    ys, xs = np.nonzero(m & ~inner)
    points = np.column_stack([xs, ys]).astype(np.float32) + 0.5
    if len(points) > max_points:
        points = points[np.linspace(0, len(points) - 1, max_points).astype(int)]
    return points


def outside_distance(mask: np.ndarray) -> torch.Tensor:
    """Distance (px) from each pixel to the mask; 0 inside it. (1, 1, H, W) for grid_sample."""
    return torch.as_tensor(distance_transform_edt(~mask.astype(bool)), dtype=torch.float32)[None, None]


def vertex_normals(vertices: torch.Tensor, faces: torch.Tensor) -> torch.Tensor:
    v0, v1, v2 = vertices[faces[:, 0]], vertices[faces[:, 1]], vertices[faces[:, 2]]
    face_normals = torch.cross(v1 - v0, v2 - v0, dim=1)
    normals = torch.zeros_like(vertices).index_add(0, faces.reshape(-1), face_normals.repeat_interleave(3, dim=0))
    return normals / normals.norm(dim=1, keepdim=True).clamp(min=1e-9)


def sample(image: torch.Tensor, pixels: torch.Tensor, size: tuple[int, int]) -> torch.Tensor:
    w, h = size
    grid = torch.stack([pixels[:, 0] / w * 2 - 1, pixels[:, 1] / h * 2 - 1], dim=1)[None, None]
    return F.grid_sample(image, grid, align_corners=False, padding_mode="border")[0, 0, 0]


class Refiner:
    def __init__(self, settings: RefineSettings | None = None, model: BodyModel | None = None):
        self.settings = settings or RefineSettings()
        self.model = model or load(self.settings.lod)
        rest, _ = self.model.forward(torch.zeros(20))
        rest = rest.detach()
        self.top = int(rest[:, 1].argmax())
        self.bottom = int(rest[:, 1].argmin())
        # Shoulder points on the average body, used for a differentiable straight shoulder breadth.
        from .body.measure import shoulder_point

        geometry = self.model.geometry(np.zeros(20))
        self.shoulder_vertices = [
            int(np.linalg.norm(geometry.vertices - shoulder_point(geometry, s), axis=1).argmin()) for s in ("l", "r")
        ]
        self.joint_index = {n: self.model.joint_names.index(n) for n in KEYPOINT_JOINTS}
        self.scale_index = [self.model.param_names.index(n) for n in self.model.scale_names]

    def _params(self, base: np.ndarray | None, scales: torch.Tensor) -> torch.Tensor:
        params = (
            torch.zeros(1, 204) if base is None else torch.as_tensor(base, dtype=torch.float32).reshape(1, 204).clone()
        )
        params[0, self.scale_index] = 0.0
        index = torch.tensor(self.scale_index)
        return params.index_put((torch.zeros(len(index), dtype=torch.long), index), scales)

    def fit(
        self,
        views: list[ViewObservation],
        height_cm: float,
        biacromial_prior: tuple[float, float] | None = None,
        init_coeffs: np.ndarray | None = None,
        init_scales: dict[str, float] | None = None,
    ) -> tuple[np.ndarray, dict[str, float], dict[str, float]]:
        """(coeffs, scales, final loss terms)."""
        st = self.settings
        coeffs = torch.tensor(
            np.zeros(20) if init_coeffs is None else init_coeffs, dtype=torch.float32, requires_grad=True
        )
        scales0 = [float((init_scales or {}).get(n, 0.0)) for n in self.model.scale_names]
        scales = torch.tensor(scales0, dtype=torch.float32, requires_grad=True)
        rotvecs, translations, rot0 = [], [], []
        for v in views:
            rot0.append(torch.as_tensor(v.camera.rotation, dtype=torch.float32))
            rotvecs.append(torch.zeros(3, requires_grad=True))
            translations.append(torch.tensor(v.camera.translation, dtype=torch.float32, requires_grad=True))
        outlines = [
            torch.as_tensor(mask_outline(v.mask, st.contour_points)) if v.mask is not None else None for v in views
        ]
        distances = [outside_distance(v.mask) if v.mask is not None else None for v in views]
        faces = torch.as_tensor(self.model.faces)
        optimiser = torch.optim.Adam(
            [
                {"params": [coeffs], "lr": st.lr_shape},
                {"params": [scales], "lr": st.lr_shape * st.scale_sd},
                {"params": rotvecs, "lr": 0.005},
                {"params": translations, "lr": 0.5},
            ]
        )
        terms: dict[str, torch.Tensor] = {}
        for _ in range(st.iterations):
            optimiser.zero_grad()
            terms = {"keypoints": 0.0, "silhouette": 0.0}
            for i, v in enumerate(views):
                vertices, skeleton = self.model.forward(
                    coeffs, model_parameters=self._params(v.model_parameters, scales)
                )
                rot = _rodrigues(rotvecs[i]) @ rot0[i]
                if v.keypoints:
                    names = [n for n in v.keypoints if n in self.joint_index]
                    joints = skeleton[[self.joint_index[n] for n in names], :3]
                    observed = torch.tensor([v.keypoints[n][:2] for n in names], dtype=torch.float32)
                    weight = torch.tensor([v.keypoints[n][2] for n in names], dtype=torch.float32)
                    error = ((_project(joints, rot, translations[i], v.camera) - observed) ** 2).sum(dim=1)
                    terms["keypoints"] = terms["keypoints"] + 0.5 * (weight * error).sum() / st.keypoint_px**2
                if outlines[i] is not None:
                    camera_points = vertices @ rot.T + translations[i]
                    sight = camera_points / camera_points.norm(dim=1, keepdim=True)
                    normals = vertex_normals(vertices, faces) @ rot.T
                    rim = (normals * sight).sum(dim=1).abs().detach() < st.rim_cos
                    projected = _project(vertices[rim], rot, translations[i], v.camera)
                    # Too small: each outline point pulls its nearest rim vertex.
                    nearest = torch.cdist(outlines[i], projected).min(dim=1).values
                    # Too big: rim vertices outside the mask are pushed back in.
                    outside = sample(distances[i], projected, v.image_size)
                    terms["silhouette"] = (
                        terms["silhouette"]
                        + 0.5 * ((nearest**2).mean() + (outside**2).mean()) * len(outlines[i]) ** 0.5 / st.outline_px**2
                    )
            rest, _ = self.model.forward(coeffs, model_parameters=self._params(None, scales))
            stature = rest[self.top, 1] - rest[self.bottom, 1]
            terms["height"] = 0.5 * ((stature - height_cm) / st.height_cm) ** 2
            terms["prior"] = 0.5 * (coeffs**2).sum() + 0.5 * ((scales / st.scale_sd) ** 2).sum()
            if biacromial_prior is not None:
                mean, sd = biacromial_prior
                breadth = torch.linalg.norm(rest[self.shoulder_vertices[0]] - rest[self.shoulder_vertices[1]])
                terms["prior"] = terms["prior"] + 0.5 * ((breadth - mean) / sd) ** 2
            loss = terms["keypoints"] + terms["silhouette"] + terms["height"] + terms["prior"]
            loss.backward()
            optimiser.step()
        final = {k: float(v.detach()) if isinstance(v, torch.Tensor) else float(v) for k, v in terms.items()}
        return (
            coeffs.detach().numpy().astype(np.float64),
            {n: float(s) for n, s in zip(self.model.scale_names, scales.detach().numpy(), strict=True)},
            final,
        )


class TwoViewRefiner:
    """Adapter for the pipeline: builds observations from each view's extras (set by the reconstructor)."""

    def __init__(self, refiner: Refiner | None = None):
        self.refiner = refiner or Refiner()

    def fit(self, front, side, height_cm: float, prior: dict) -> tuple[np.ndarray, dict[str, float]]:
        views = [front.extras["observation"], side.extras["observation"]]
        b = prior.get("shoulder_biacromial")
        init = (np.asarray(front.coeffs) + np.asarray(side.coeffs)) / 2
        names = set(front.scales) | set(side.scales)
        init_scales = {n: (front.scales.get(n, 0.0) + side.scales.get(n, 0.0)) / 2 for n in names}
        coeffs, scales, _ = self.refiner.fit(
            views, height_cm, (b.value_cm, b.sd_cm) if b else None, init_coeffs=init, init_scales=init_scales
        )
        return coeffs, scales
