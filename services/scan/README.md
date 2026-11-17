# FitDNA scan service

Two photos (front and side) and a stated height in; tape-style body measurements with ranges, 20 body-shape numbers and a faceless avatar (GLB) out. The web app calls it from `apps/web/src/app/api/scan/route.ts`. Photos live only in the request: nothing is written to disk, logged or kept.

**Status: development only.** The GPU path (`modal_app.py`, `app/recon.py`) has never run. Accuracy on real people is unknown until the validation study (`evals/README.md`). The scan must not be enabled for real users until the go/no-go and the legal launch gates in the M6 plan are met.

## Layout

| Path | What it is |
| --- | --- |
| `app/api.py` | FastAPI app: `GET /v1/health`, `POST /v1/scan` |
| `app/auth.py` | HMAC request signing (shared with the web app) |
| `app/validate.py` | Size limits, image sniffing, in-memory multipart parsing, field ranges |
| `app/pipeline.py` | Stages: reconstruct each view → pose checks → stats prior → refine → measure → uncertainty → avatar |
| `app/recon.py` | Per-photo MediaPipe Pose + SAM 3D Body (GPU, not yet run) |
| `app/refine.py` | Two-view fit of one MHR body to both photos (keypoints + silhouettes + height + prior), pure torch |
| `app/body/` | MHR body model wrapper, tape-style measurements on the mesh, GLB export |
| `app/stats/` | ANSUR II regression: prior, fallback and validation baseline (`coefficients.json` is generated) |
| `app/uncertainty.py`, `app/calibration.json` | Ranges and confidence; literature values until the study recalibrates them |
| `app/synthetic.py` | Rendered MHR bodies with known measurements, for tests and evals (no real people) |
| `stub_server.py` | Same API with no GPU or body model, for web development |
| `modal_app.py` | Deployment on Modal (L4 GPU); not deployed |
| `evals/` | Synthetic refinement check and the validation-study harness |

## Setup

Needs [uv](https://docs.astral.sh/uv/). Run everything from this folder.

```bash
uv sync                       # core only: API, validation, geometry, stats, stub server, CPU tests
uv sync --extra body          # adds the MHR body model on CPU (torch, pymomentum-cpu, mhr)
```

The body model also needs MHR's assets (199 MB download, 4.4 GB unpacked) in `.cache/mhr/assets`, or wherever `MHR_ASSETS` points:

```bash
mkdir -p .cache/mhr && cd .cache/mhr
curl -LO https://github.com/facebookresearch/MHR/releases/download/v1.0.1/assets.zip
unzip assets.zip && rm assets.zip && cd ../..
```

## Run

```bash
SCAN_API_SECRET=... uv run python stub_server.py --port 8787
```

The stub has the real API, signing and validation. Its measurements come from the statistics model and its avatar is made of primitive shapes. Some heights simulate failures (121 cm → `pose_front`, 122 → `pose_side`, 123 → `multiple_people`, 124 → `no_person`, 125 → `failed`, 126 → a 20 s delay). Point the web app at it with `SCAN_API_URL=http://127.0.0.1:8787`.

## Test

```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest -q              # tests marked `mhr` skip without the body extra and assets
uv run python -m evals.synthetic_refine --bodies 20   # does refinement recover known bodies? (needs the body extra)
```

CI runs the core tests only: no GPU, weights or tokens.

## API

`POST /v1/scan`, `multipart/form-data`:

- files `front` and `side`: JPEG, PNG or WebP, each at most 900 KB, short side at least 480 px, long side at most 2000 px;
- `height_cm` (required, 120–230); `weight_kg` (30–250), `age` (18–100) and `sex` (`male`/`female`) are optional and only sharpen the prior.

The whole body is at most 1.9 MB. That keeps it under Modal's 2 MiB limit, above which web payloads are kept in US object storage.

Signed headers, checked before the body is read:

```
X-FitDNA-Timestamp:       unix seconds (within 300 s of the server clock)
X-FitDNA-Scan-Id:         a UUID
X-FitDNA-Content-SHA256:  hex SHA-256 of the exact body bytes
X-FitDNA-Signature:       hex HMAC-SHA256(SCAN_API_SECRET, "{timestamp}\n{scan_id}\n{content_sha256}")
```

Success (200): `pipeline_version`; `measurements` with `chest`, `shoulder` (across the back), `arm`, `waist` and `hip`, each `{value_cm, range_cm, confidence, disagreement_cm, flags}`; `body_shape` (layout `mhr-1.0.1/body20+scales`: 20 body coefficients and 13 skeleton scales); `glb_base64` (at most 600 KB); `flags`.

Errors: `{"error": code}`.

| HTTP | Codes |
| --- | --- |
| 401 | `unauthorized` |
| 413 | `too_large` |
| 400 | `bad_request` |
| 422 | `bad_image`, `no_person`, `multiple_people`, `pose_front`, `pose_side`, `bad_height` |
| 504 | `timeout` |
| 500 | `failed` |

## Body data and privacy

- Photos are parsed in memory (the stdlib `email` parser, not Starlette's form parser, which spools files over 1 MB to disk). A test asserts that a scan writes no files. On Modal, `TMPDIR` is in memory, the weights Volume is read-only at request time and there are no memory snapshots.
- Logs carry a hashed scan reference, the stage, the error code and timings. They never carry images, measurements or form fields.
- The stored body shape is 20 body coefficients and 13 skeleton scales. Head, face, eye and finger parameters are always zero, so every avatar has the same generic head and no face.
- Modal routes requests through us-east even when GPUs are pinned to `region="ca"`. Using it for real users needs the Law 25 s. 17 assessment and a DPA first (M6 plan, M6e).

## M6a checklist (unverified until the first GPU run)

- [ ] SAM 3D Body: is `shape_params` MHR's 45-value identity vector (first 20 = body)? Until confirmed, refinement starts from the prior.
- [ ] SAM 3D Body: does `process_one_image` take an RGB array? Does the code at the pinned commit (`app/schema.py`: `b5c765a`, weights `11aaa346`) build with the image's torch 2.8 and CUDA 12.8? The weights repo bundles its own `assets/mhr_model.pt`: check it's the same MHR 1.0.1.
- [ ] MediaPipe Pose Landmarker runs in the Modal image; landmarks and masks match `app/recon.py`'s assumptions.
- [ ] Timings and memory on an L4: cold start, warm scan (target ≤ 90 s end to end).
- [ ] Modal answers a web request still running after about 150 s with a 303 redirect to poll. The web app never follows redirects (they would carry the signature and proxy secret) and counts one as a timeout, so cold start plus scan must stay under 150 s, or the service needs `REQUEST_BUDGET_SECONDS` lowered from 200. Verify the limit and the behaviour.
- [ ] Modal: `region="ca"` on the account's plan; DPA and sub-processors.
- [ ] Developer repeatability: 5 scans, shoulder and arm within 1 cm.

Verified on CPU with the real MHR model: units (cm, Y up, facing +Z), the A-pose rest stature of 172.7 cm, vertex counts per level of detail, measurements in adult ranges, and refinement on synthetic two-view bodies. On 8 bodies at LOD3 the mean absolute errors were chest 0.88 cm, shoulder 1.21, arm 0.44, waist 1.59 and hip 1.32. Synthetic bodies say nothing about clothing, segmentation or real cameras.

## Licences

- MHR code and assets: Apache 2.0. SAM 3D Body: SAM License (weights gated on Hugging Face, never redistributed here). MediaPipe: Apache 2.0. See `THIRD_PARTY_LICENSES/`.
- ANSUR II: the source page states no licence. Only fitted coefficients are committed, never the data. Confirm the licence before real users get these numbers.
- Nothing here uses SMPL, SMPL-X or any other non-commercial body model.
