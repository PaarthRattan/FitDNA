# FitDNA — Roadmap / Plan (July 2026)

Strategy (post-research): **fit-prediction platform first, 3D simulator second.**
RGB-only capture · self-built body model (SAM 3D Body + MHR; changed from renting Bodygram / Meshcapade on 2026-11-10, see M6 below) · measurement-based fit engine · diffusion try-on as visual layer only · the moat = the fit-feedback dataset.
Scope v1: **tops + jackets** (chest / shoulder / length / sleeve).

## Stack
- Web: Next.js + React + TS + Tailwind + shadcn/ui · 3D: React Three Fiber
- Extension: Plasmo (MV3) — reads the page the user is on; eBay Browse API; affiliate feeds later
- Backend: FastAPI + Python, Celery + Redis · DB: Supabase Postgres + pgvector · files: R2/S3
- Body: self-built photo scan in `services/scan`: SAM 3D Body (SAM License) → MHR body model (Apache 2.0), two-view refinement, tape-style measurements, ANSUR II statistics as prior and fallback. Meshcapade shut down its platform on 2026-04-18; Bodygram keeps photos up to 30 days. Nothing touches SMPL/SMPL-X (non-commercial).
- Scan guidance: MediaPipe Pose (on-device) · Garment analysis: SAM 2 + OCR + CLIP/SigLIP
- Fit engine: ease-based rules → XGBoost once feedback data exists
- Try-on visual: FASHN (~$0.075/img) or Kling Kolors (commercial-cleared; IDM-VTON/OOTDiffusion are NC)
- GPU: Modal / RunPod serverless · Deploy: Vercel + Render · Sentry + PostHog

## Phase 0 — Foundations (wk 1–2)
- [ ] Monorepo skeletons: Next.js app, FastAPI, Plasmo extension
- [ ] Supabase schema: User, BodyProfile, FitPreference, ReferenceGarment, GarmentFingerprint, GarmentSize, MarketplaceListing, FitPrediction, Purchase, FitFeedback, PriceHistory
- [ ] Consent flow v1 (Law 25 / PIPEDA express opt-in) + delete-raw-photos-after-processing pipeline

## Phase 1 — Fit Passport (wk 3–6)
- [ ] Guided 2-photo capture flow, MediaPipe pose validation
- [x] Photo scan → measurements + ranges + confidence (M6a–c: service and web built, development only; the GPU path hasn't run yet)
- [ ] M6d validation study: ≥30 adults vs helper-taken tape, go/no-go in `services/scan/evals/README.md`. No-go → ship the statistics pre-fill instead
- [ ] M6e launch gates (below) before `SCAN_ENABLED=true` for real users
- [ ] Manual tape-measure fallback
- [ ] Reference garments: measure 3 owned tops/jackets

## Phase 2 — Fit engine + extension (wk 7–11)
- [ ] Ease rules engine (garment vs body vs reference pieces)
- [ ] Size-chart OCR + garment fingerprint (1 retailer) + eBay Browse API
- [ ] Plasmo panel: size rec + confidence + written fit explanation
- [ ] Fit map v1 (colored zones, no cloth physics)

## Phase 3 — Marketplace + feedback loop (wk 12–16)
- [ ] Cross-marketplace same-item search (embeddings, duplicate detection)
- [ ] Purchase Confidence Score (fit + price history + condition + seller)
- [ ] Post-purchase fit-check flow → FitFeedback (the moat)
- [ ] Friends-and-family beta (10 users)

## Phase 4 — v2 (only after validated demand)
- [ ] FASHN try-on visuals (a faceless avatar viewer shipped with M6, in plain three.js)
- [ ] XGBoost personalized ranking on feedback data
- [x] ~~Self-hosted mesh recovery~~: moved into M6 once SAM 3D Body + MHR made it licence-clean
- [ ] Blender headless cloth sim drape maps; trousers category

## Legal gates (do not skip)
- Express consent before any scan (its own consent, separate from body data); photos processed in one request and never persisted, on our side or the GPU provider's; encrypt; user deletion rights
- No biometric database (characteristics *or measurements*) without CAI disclosure ≥60 days prior (Quebec IT Act s. 45; the CAI reads it broadly, so put the stored avatar's 20 shape numbers to Quebec counsel)
- Law 25: s. 3.3 PIA for the scan; s. 17 PIA + DPA before photos leave Quebec (Vercel and Modal are in the US)
- Geo-gate Illinois (fails closed on unknown regions). Since the 2024 BIPA amendment a consent route is possible, but the gate stays the simpler choice
- Confirm the ANSUR II licence before real users see statistics-based numbers
- Quebec privacy lawyer review before public launch

## To validate next
- Concierge/fake-door test: will people do the 10-min setup?
- ~~Bodygram vs Meshcapade bake-off~~: replaced by the M6d scan validation study
- Sample 100 resale listings: how many have usable measurements?
- Extension vs paste-a-link friction test
- Retailer ToS / affiliate-feed review
- FitDNA trademark + domain check
