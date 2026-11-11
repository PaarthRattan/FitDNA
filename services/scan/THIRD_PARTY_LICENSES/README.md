# Third-party licences

What the scan service uses that isn't ours, under what terms, and what we owe. Checked 2026-11-11.

| Component | Licence | Text | How it's used |
| --- | --- | --- | --- |
| MHR (Momentum Human Rig) code, `mhr==1.0.1` | Apache 2.0 | `MHR-Apache-2.0.txt` | Body model: shape → mesh, measurements, avatar |
| MHR assets (`assets.zip`, release v1.0.1) | Apache 2.0 (`LICENSE.txt` in the zip, identical to the code's) | `MHR-Apache-2.0.txt` | Downloaded at setup or into the Modal Volume, never committed |
| pymomentum (`pymomentum-cpu` / `pymomentum-gpu`) | MIT | `pymomentum-MIT.txt` | MHR's skinning and skeleton runtime |
| SAM 3D Body (code at a pinned commit; weights `facebook/sam-3d-body-dinov3`) | SAM License (Meta, 2025-11-19) | `SAM-License.txt` | Starting body shape per photo, on the GPU only |
| MediaPipe Pose Landmarker (library and `pose_landmarker_heavy.task`) | Apache 2.0 | — (standard text, as above) | Person count, 2D keypoints, person mask |
| detectron2 (pinned commit, SAM 3D Body dependency) | Apache 2.0 | — | Installed in the GPU image only |
| PyTorch, NumPy, SciPy, Pillow, trimesh, FastAPI, Pydantic | BSD / MIT / HPND | — | Ordinary Python dependencies |
| ANSUR II anthropometric survey (US Army, 2012) | **None stated** on the source page | — | Only fitted regression coefficients are committed (`app/stats/coefficients.json`); the data never is |

## Obligations and open points

- **SAM License:** commercial use is allowed. If the SAM materials or derivatives are ever distributed, a copy of the licence goes with them. We don't redistribute: the weights are pulled from Hugging Face into a private Volume. Use must follow privacy and data-protection law (s. 1.b.iii), which the M6e launch gates cover. Meta may change the terms with immediate effect (s. 8), so re-read them before launch and when bumping the pinned revision.
- **Apache 2.0 (MHR, MediaPipe, detectron2):** keep the licence and any NOTICE when redistributing. The avatar files we store are outputs of the model, not redistributed assets.
- **ANSUR II:** confirm the terms (US government work; the hosting site doesn't say) before real users see numbers from `coefficients.json`. This is an M6e launch gate.
- **Not used, on purpose:** SMPL, SMPL-X, SHAPY, HMR2 and anything else built on non-commercial body models; Anny (its topology comes from SMPL-X); nvdiffrast (non-commercial).
