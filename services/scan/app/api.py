"""HTTP API. One synchronous request does everything; nothing is stored between requests.

    GET  /v1/health  -> {"ok": true, "pipeline_version": ...}   (also used to pre-warm a container)
    POST /v1/scan    -> ScanResult JSON, or {"error": code} with 4xx/5xx

POST /v1/scan is multipart/form-data: files `front` and `side`; fields `height_cm` (required),
`weight_kg`, `age`, `sex` (optional). It must be signed (auth.py). The signature is checked from
headers before the body is read; the body is read into memory with a cap and never spooled to
disk (Starlette's form parser would spool files over 1 MB to a temporary file, so it isn't used).
Logs carry a hashed scan id, the stage, timings and the outcome code. Never images, never numbers.
"""

import asyncio
import hashlib
import logging
import os
import time
from collections.abc import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .auth import body_matches, verify_headers
from .pipeline import Pipeline
from .schema import PIPELINE_VERSION
from .validate import MAX_BODY_BYTES, Rejected, parse_upload

REQUEST_BUDGET_SECONDS = 200.0
log = logging.getLogger("fitdna.scan")

STATUS = {
    "unauthorized": 401,
    "too_large": 413,
    "bad_request": 400,
    "bad_image": 422,
    "no_person": 422,
    "multiple_people": 422,
    "pose_front": 422,
    "pose_side": 422,
    "bad_height": 422,
    "timeout": 504,
    "failed": 500,
}


def _scan_ref(scan_id: str) -> str:
    return hashlib.sha256(scan_id.encode()).hexdigest()[:12]


def _error(code: str) -> JSONResponse:
    return JSONResponse({"error": code}, status_code=STATUS[code])


async def _read_capped(request: Request, cap: int) -> bytes | None:
    declared = request.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or int(declared) > cap):
        return None
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > cap:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def create_app(
    pipeline_factory: Callable[[], Pipeline],
    secret: Callable[[], str] = lambda: os.environ.get("SCAN_API_SECRET", ""),
    clock: Callable[[], float] = time.time,
) -> FastAPI:
    app = FastAPI(title="FitDNA scan", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/v1/health")
    async def health() -> dict:
        return {"ok": True, "pipeline_version": PIPELINE_VERSION}

    @app.post("/v1/scan")
    async def scan(request: Request) -> JSONResponse:
        started = time.monotonic()
        ok, content_sha256 = verify_headers(dict(request.headers), secret(), clock())
        ref = _scan_ref(request.headers.get("x-fitdna-scan-id", ""))
        if not ok or content_sha256 is None:
            log.info("scan %s stage=auth code=unauthorized", ref)
            return _error("unauthorized")
        body = await _read_capped(request, MAX_BODY_BYTES)
        if body is None:
            return _error("too_large")
        if not body_matches(body, content_sha256):
            log.info("scan %s stage=auth code=unauthorized", ref)
            return _error("unauthorized")
        try:
            upload = parse_upload(request.headers.get("content-type", ""), body)
            del body
            pipeline = pipeline_factory()
            deadline = time.monotonic() + REQUEST_BUDGET_SECONDS
            result = await asyncio.to_thread(pipeline.run, upload, deadline)
        except Rejected as rejected:
            log.info("scan %s stage=run code=%s ms=%d", ref, rejected.code, (time.monotonic() - started) * 1000)
            return _error(rejected.code)
        except Exception as error:  # never include request data in the log
            log.error("scan %s stage=run code=failed type=%s", ref, type(error).__name__)
            return _error("failed")
        log.info("scan %s stage=done code=ok ms=%d", ref, (time.monotonic() - started) * 1000)
        return JSONResponse(result.model_dump())

    return app
