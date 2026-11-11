"""Checks on everything that arrives, before any model sees it. All in memory: nothing is written to disk.

Limits are set so the whole request stays under 2 MiB: Modal keeps larger web-request payloads in
its US object storage (docs/guide/data-residency), and photos must never be stored anywhere.
"""

from dataclasses import dataclass
from email import policy
from email.parser import BytesParser
from io import BytesIO

import numpy as np
from PIL import Image, ImageOps

MAX_BODY_BYTES = 1_900_000
MAX_IMAGE_BYTES = 900 * 1024
MIN_SHORT_SIDE = 480
MAX_LONG_SIDE = 2000
# Decompression-bomb guard: refuse anything claiming more pixels than this before decoding.
Image.MAX_IMAGE_PIXELS = 2000 * 2000

HEIGHT_RANGE = (120.0, 230.0)
WEIGHT_RANGE = (30.0, 250.0)
AGE_RANGE = (18, 100)


class Rejected(Exception):
    """A request the service refuses. `code` is one of schema.ErrorCode."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Fields:
    height_cm: float
    weight_kg: float | None
    age: int | None
    sex: str | None


@dataclass(frozen=True)
class Upload:
    front: np.ndarray  # H×W×3 uint8 RGB, EXIF orientation applied, metadata discarded
    side: np.ndarray
    fields: Fields


def sniff_image_type(data: bytes) -> str | None:
    """The real type from the first bytes. Same rules as the web app's sniffImageType."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def decode_image(data: bytes) -> np.ndarray:
    if len(data) > MAX_IMAGE_BYTES:
        raise Rejected("too_large")
    if sniff_image_type(data) is None:
        raise Rejected("bad_image")
    try:
        with Image.open(BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            rgb = img.convert("RGB")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise Rejected("too_large") from None
    except Exception:
        raise Rejected("bad_image") from None
    w, h = rgb.size
    if min(w, h) < MIN_SHORT_SIDE:
        raise Rejected("bad_image")
    if max(w, h) > MAX_LONG_SIDE:
        raise Rejected("too_large")
    return np.asarray(rgb, dtype=np.uint8)


def _number(raw: str | None, lo: float, hi: float, code: str, required: bool) -> float | None:
    if raw is None or raw.strip() == "":
        if required:
            raise Rejected(code)
        return None
    try:
        value = float(raw)
    except ValueError:
        raise Rejected(code) from None
    if not (lo <= value <= hi) or value != value:
        raise Rejected(code)
    return value


def parse_fields(form: dict[str, str]) -> Fields:
    height = _number(form.get("height_cm"), *HEIGHT_RANGE, code="bad_height", required=True)
    weight = _number(form.get("weight_kg"), *WEIGHT_RANGE, code="bad_request", required=False)
    age = _number(form.get("age"), *AGE_RANGE, code="bad_request", required=False)
    sex = (form.get("sex") or "").strip() or None
    if sex not in (None, "male", "female"):
        raise Rejected("bad_request")
    return Fields(height_cm=height, weight_kg=weight, age=int(age) if age is not None else None, sex=sex)


def parse_multipart(content_type: str, body: bytes) -> tuple[dict[str, bytes], dict[str, str]]:
    """(files, fields) from a multipart/form-data body, parsed in memory with the standard library."""
    if len(body) > MAX_BODY_BYTES:
        raise Rejected("too_large")
    if not content_type.lower().startswith("multipart/form-data") or "boundary=" not in content_type:
        raise Rejected("bad_request")
    message = BytesParser(policy=policy.HTTP).parsebytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body)
    if not message.is_multipart():
        raise Rejected("bad_request")
    files: dict[str, bytes] = {}
    fields: dict[str, str] = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name or name in files or name in fields:
            raise Rejected("bad_request")
        payload = part.get_payload(decode=True) or b""
        if part.get_filename() is not None:
            files[name] = payload
        else:
            fields[name] = payload.decode("utf-8", errors="strict")[:64]
    return files, fields


def parse_upload(content_type: str, body: bytes) -> Upload:
    files, form = parse_multipart(content_type, body)
    if set(files) != {"front", "side"}:
        raise Rejected("bad_request")
    fields = parse_fields(form)
    return Upload(front=decode_image(files["front"]), side=decode_image(files["side"]), fields=fields)
