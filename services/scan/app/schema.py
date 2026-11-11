"""The service's request fields and response shape. The web app validates the same shape in src/lib/scan/result.ts."""

from typing import Literal

from pydantic import BaseModel, Field

# Bump a component whenever it changes, so stored scans say what produced them.
# SAM 3D Body: code commit and Hugging Face weights revision (latest on 2026-11-11; modal_app.py builds from these).
SAM3DB_COMMIT = "b5c765a0d89d789985e186d396315e7590887b94"
SAM3DB_REVISION = "11aaa346c7204874a1cbafe3d39a979080b2c55a"
MHR_VERSION = "1.0.1"
REFINE_VERSION = "1"
MEASURE_VERSION = "1"
PIPELINE_VERSION = f"sam3db:{SAM3DB_REVISION[:12]}|mhr:{MHR_VERSION}|refine:{REFINE_VERSION}|measure:{MEASURE_VERSION}"

# Matches scans.error_code in the database.
ErrorCode = Literal[
    "unauthorized",
    "too_large",
    "bad_request",
    "bad_image",
    "no_person",
    "multiple_people",
    "pose_front",
    "pose_side",
    "bad_height",
    "timeout",
    "failed",
]

MeasurementName = Literal["chest", "shoulder", "arm", "waist", "hip"]
Sex = Literal["male", "female"]


class Measurement(BaseModel):
    value_cm: float = Field(gt=0, lt=300)
    range_cm: float = Field(ge=0, lt=50)
    confidence: int = Field(ge=0, le=100)
    # |front-only − side-only| reading, when both views were fitted separately.
    disagreement_cm: float | None = None
    flags: list[str] = Field(default_factory=list)


class BodyShape(BaseModel):
    """What's stored for the avatar: body shape only. No head, face, hand or finger parameters."""

    layout: str  # e.g. "mhr-1.0.1/body20+scales"
    coeffs: list[float] = Field(min_length=20, max_length=20)
    scales: dict[str, float]


class ScanResult(BaseModel):
    pipeline_version: str
    measurements: dict[MeasurementName, Measurement]
    body_shape: BodyShape
    glb_base64: str
    flags: list[str] = Field(default_factory=list)


class ScanError(BaseModel):
    error: ErrorCode
