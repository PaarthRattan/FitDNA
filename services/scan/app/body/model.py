"""The MHR body model (Meta's Momentum Human Rig, Apache-2.0, assets Apache-2.0), wrapped for measuring.

MHR describes a body with 45 identity coefficients (20 body, 20 head, 5 hands) and, separately,
skeleton scales inside its 204 model parameters (shoulder width, arm length, ...). FitDNA keeps
only what describes the body below the head: the 20 body coefficients and the body's skeleton
scales. Head, face-expression, eye and finger parameters are always zero, so every avatar has the
same generic head and hands and none carries anyone's face.

Needs torch, mhr and pymomentum (`uv sync --extra body`), and the MHR assets (scripts/fetch_mhr_assets.sh).
"""

import os
import re
from functools import lru_cache
from pathlib import Path

import numpy as np
import torch
from mhr.mhr import MHR

from .measure import REGIONS, BodyGeometry

NUM_BODY_COEFFS = 20
NUM_IDENTITY = 45
NUM_MODEL_PARAMS = 204
LAYOUT = "mhr-1.0.1/body20+scales"

# Skeleton scales that describe the face or the hands: never part of a stored shape.
_NOT_BODY = re.compile(r"eye|thumb|index|middle|ring|pinky|hands")

_HEAD = re.compile(r"^c_(head|jaw|teeth|tongue)|^[lr]_eye")
_NECK = re.compile(r"^c_neck")
_HAND = re.compile(r"^([lr])_(wrist$|thumb|index|middle|ring|pinky)")
_ARM = re.compile(r"^([lr])_(uparm|lowarm|wrist_twist)")
_LEG = re.compile(r"^([lr])_(upleg|lowleg|foot|talocrural|subtalar|transversetarsal|ball)")

DEFAULT_ASSETS = Path(__file__).resolve().parents[2] / ".cache" / "mhr" / "assets"


def assets_folder() -> Path:
    return Path(os.environ.get("MHR_ASSETS", DEFAULT_ASSETS))


def region_of_joint(name: str) -> str:
    if _HEAD.match(name):
        return "head"
    if _NECK.match(name):
        return "neck"
    if m := _HAND.match(name):
        return f"hand_{m.group(1)}"
    if m := _ARM.match(name):
        return f"arm_{m.group(1)}"
    if m := _LEG.match(name):
        return f"leg_{m.group(1)}"
    return "torso"  # root, spine, clavicles


class BodyModel:
    """One level of detail of MHR. LOD 1 (18,439 vertices) for measuring, LOD 3 (4,899) for the avatar file."""

    def __init__(self, lod: int = 1, device: str = "cpu", assets: Path | None = None):
        self.device = torch.device(device)
        self.mhr = MHR.from_files(
            folder=assets or assets_folder(), device=self.device, lod=lod, wants_pose_correctives=False
        )
        character = self.mhr.character
        self.lod = lod
        self.joint_names: list[str] = list(character.skeleton.joint_names)
        self.faces = np.asarray(character.mesh.faces, dtype=np.int64)
        self.param_names: list[str] = list(character.parameter_transform.names)[:NUM_MODEL_PARAMS]
        scaling = np.asarray(character.parameter_transform.scaling_parameters)[:NUM_MODEL_PARAMS]
        self.scale_names = [n for n, s in zip(self.param_names, scaling, strict=True) if s and not _NOT_BODY.search(n)]
        index = np.asarray(character.skin_weights.index)
        weight = np.asarray(character.skin_weights.weight)
        dominant = index[np.arange(len(index)), weight.argmax(axis=1)]
        joint_region = np.array([REGIONS.index(region_of_joint(n)) for n in self.joint_names])
        self.region = joint_region[dominant]

    def model_parameters(self, scales: dict[str, float] | torch.Tensor | None = None) -> torch.Tensor:
        """Rest pose (all pose parameters zero, an A-pose) with the given body scales; [1, 204]."""
        params = torch.zeros(1, NUM_MODEL_PARAMS, device=self.device)
        if scales is None:
            return params
        idx = [self.param_names.index(n) for n in self.scale_names]
        if isinstance(scales, torch.Tensor):
            params = params.index_put((torch.zeros(len(idx), dtype=torch.long), torch.tensor(idx)), scales.reshape(-1))
            return params
        for name, value in scales.items():
            if name not in self.scale_names:
                raise ValueError(f"{name} isn't a body scale")
            params[0, self.param_names.index(name)] = float(value)
        return params

    def identity(self, coeffs: list[float] | torch.Tensor) -> torch.Tensor:
        """Body coefficients padded to MHR's 45 with zeros for head and hands; [1, 45]."""
        body = torch.as_tensor(coeffs, dtype=torch.float32, device=self.device).reshape(1, NUM_BODY_COEFFS)
        return torch.cat([body, torch.zeros(1, NUM_IDENTITY - NUM_BODY_COEFFS, device=self.device)], dim=1)

    def forward(self, coeffs, scales=None, model_parameters: torch.Tensor | None = None):
        """(vertices [V, 3], skeleton state [J, 8]) in cm.

        Differentiable in coeffs and scales when they require grad.
        """
        params = model_parameters if model_parameters is not None else self.model_parameters(scales)
        vertices, skeleton = self.mhr(self.identity(coeffs), params, None, apply_correctives=False)
        return vertices[0], skeleton[0]

    def geometry(self, coeffs, scales: dict[str, float] | None = None) -> BodyGeometry:
        with torch.no_grad():
            vertices, skeleton = self.forward(coeffs, scales)
        positions = skeleton[:, :3].cpu().numpy().astype(np.float64)
        return BodyGeometry(
            vertices=vertices.cpu().numpy().astype(np.float64),
            faces=self.faces,
            region=self.region,
            joints={name: positions[i] for i, name in enumerate(self.joint_names)},
        )


@lru_cache(maxsize=4)
def load(lod: int = 1, device: str = "cpu") -> BodyModel:
    return BodyModel(lod=lod, device=device)
