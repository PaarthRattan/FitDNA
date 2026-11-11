"""Deployment on Modal (serverless GPU). NOT YET DEPLOYED: needs a Modal account, Hugging Face access to
SAM 3D Body, and the M6a checklist (README). Nothing here runs in CI.

    modal secret create huggingface HF_TOKEN=...          # your token, after accepting the SAM 3D Body terms
    modal secret create fitdna-scan SCAN_API_SECRET=...   # the same value as the web app's
    modal run modal_app.py::download_weights               # once: weights and assets into a Volume
    modal deploy modal_app.py                              # prints the endpoint URL for SCAN_API_URL

Privacy-relevant choices (see README and the PIA):
- A synchronous web endpoint: photos arrive in the request and leave with it. Requests stay under
  2 MiB, because Modal keeps larger web payloads (and all spawned-call payloads) in US object
  storage. Smaller payloads are held in the routing region (us-east by default) while routed.
- No Volume is written during a request; the weights Volume is only read. No memory snapshots
  (a snapshot captures RAM, which during a request holds photos).
- `REGION` pins the GPU containers. "ca" exists on the Starter plan at a 1.15x price; there is no
  Canadian routing region, so payloads still pass through us-east. Decide this with the PIA.
- Proxy auth (Modal-Key/Modal-Secret headers) in front of the app's own request signing.
"""

import os

import modal

# Pinned in one place, so every scan's pipeline_version names what actually ran.
from app.schema import SAM3DB_COMMIT
from app.schema import SAM3DB_REVISION as SAM3DB_HF_REVISION

SAM3DB_REPO = "https://github.com/facebookresearch/sam-3d-body.git"
SAM3DB_HF_REPO = "facebook/sam-3d-body-dinov3"  # gated: request access on Hugging Face (manual approval)
MHR_ASSETS_URL = "https://github.com/facebookresearch/MHR/releases/download/v1.0.1/assets.zip"
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/"
    "pose_landmarker_heavy.task"
)
REGION = os.environ.get("SCAN_REGION") or None  # e.g. "ca"; None lets Modal choose

app = modal.App("fitdna-scan")
weights = modal.Volume.from_name("fitdna-scan-weights", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "unzip", "curl", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.8.0", "torchvision==0.23.0", index_url="https://download.pytorch.org/whl/cu128")
    .pip_install(
        "pymomentum-gpu==0.1.114.post0",
        "mhr==1.0.1",
        "mediapipe>=0.10.21",
        "numpy>=2.0",
        "pillow>=11.0",
        "scipy>=1.13",
        "trimesh>=4.8.3,<5",
        "fastapi>=0.115",
        "pydantic>=2.9",
        "huggingface_hub",
        # SAM 3D Body's documented dependencies (INSTALL.md), minus training and plotting extras.
        "pytorch-lightning",
        "opencv-python-headless",
        "yacs",
        "scikit-image",
        "einops",
        "timm",
        "hydra-core",
        "pyrootutils",
        "roma",
        "networkx==3.2.1",
        "optree",
        "fvcore",
        "pycocotools",
        "loguru",
    )
    .run_commands(
        "pip install 'git+https://github.com/facebookresearch/detectron2.git@a1ce2f9' --no-build-isolation --no-deps",
        f"git clone {SAM3DB_REPO} /opt/sam-3d-body && cd /opt/sam-3d-body && git checkout {SAM3DB_COMMIT}",
    )
    # TMPDIR in memory (tmpfs): if anything ever asks for a temporary file, it never reaches disk.
    .env({"MHR_ASSETS": "/weights/mhr/assets", "TMPDIR": "/dev/shm"})  # noqa: S108
    .add_local_python_source("app")
)


@app.function(image=image, volumes={"/weights": weights}, secrets=[modal.Secret.from_name("huggingface")], timeout=3600)
def download_weights() -> None:
    """Once, by hand: SAM 3D Body weights, MHR assets and the MediaPipe pose model into the Volume."""
    import io
    import urllib.request
    import zipfile

    from huggingface_hub import snapshot_download

    snapshot_download(SAM3DB_HF_REPO, revision=SAM3DB_HF_REVISION, local_dir="/weights/sam-3d-body")
    with urllib.request.urlopen(MHR_ASSETS_URL) as response:  # noqa: S310 (fixed https URL)
        zipfile.ZipFile(io.BytesIO(response.read())).extractall("/weights/mhr")
    with urllib.request.urlopen(POSE_MODEL_URL) as response, open("/weights/pose_landmarker_heavy.task", "wb") as f:  # noqa: S310
        f.write(response.read())
    weights.commit()


@app.cls(
    image=image,
    gpu="L4",
    volumes={"/weights": weights},
    secrets=[modal.Secret.from_name("fitdna-scan")],
    timeout=240,
    scaledown_window=300,
    region=REGION,
)
class Scanner:
    @modal.enter()
    def load(self) -> None:
        # Weights come from the Volume; never reach the network from a serving container.
        os.environ["HF_HUB_OFFLINE"] = "1"
        import numpy as np

        from app.api import create_app
        from app.pipeline import MhrMeasurer, Pipeline
        from app.recon import MediaPipePose, Reconstructor, Sam3dBodyShape
        from app.refine import TwoViewRefiner

        pose = MediaPipePose("/weights/pose_landmarker_heavy.task")
        shape = Sam3dBodyShape("/opt/sam-3d-body", "/weights/sam-3d-body", device="cuda")
        refiner = TwoViewRefiner()
        measurer = MhrMeasurer()
        measurer.measure(np.zeros(20), {}, 170.0)  # warm the body model
        self.web_app = create_app(
            lambda: Pipeline(reconstructor=Reconstructor(pose, shape), measurer=measurer, refiner=refiner)
        )

    @modal.asgi_app(requires_proxy_auth=True)
    def web(self):
        return self.web_app
