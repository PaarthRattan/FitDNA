# FitDNA — Roadmap / Plan (July 2026)

Strategy (post-research): **fit-prediction platform first, 3D simulator second.**
RGB-only capture · rent the body model (Bodygram / Meshcapade Me) · measurement-based fit engine · diffusion try-on as visual layer only · the moat = the fit-feedback dataset.
Scope v1: **tops + jackets** (chest / shoulder / length / sleeve).

## Stack
- Web: Next.js + React + TS + Tailwind + shadcn/ui · 3D: React Three Fiber
- Extension: Plasmo (MV3) — reads the page the user is on; eBay Browse API; affiliate feeds later
- Backend: FastAPI + Python, Celery + Redis · DB: Supabase Postgres + pgvector · files: R2/S3
- Body: Bodygram or Meshcapade Me API (sidesteps SMPL commercial license)
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
- [ ] Bodygram/Meshcapade integration → measurements + ranges + confidence
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
- [ ] FASHN try-on visuals; R3F avatar viewer
- [ ] XGBoost personalized ranking on feedback data
- [ ] Self-hosted mesh recovery (NLF / 4D-Humans) — only after SMPL license or license-free model (watch Meta SAM 3D Body / MHR)
- [ ] Blender headless cloth sim drape maps; trousers category

## Legal gates (do not skip)
- Express consent before any scan; delete raw images immediately; encrypt; user deletion rights
- No biometric-recognition database without CAI disclosure ≥60 days prior (Quebec Law 25)
- Geo-gate Illinois until BIPA-compliant written consent exists
- Quebec privacy lawyer review before public launch

## To validate next
- Concierge/fake-door test: will people do the 10-min setup?
- Bodygram vs Meshcapade bake-off (pricing + accuracy on 5 bodies)
- Sample 100 resale listings: how many have usable measurements?
- Extension vs paste-a-link friction test
- Retailer ToS / affiliate-feed review
- FitDNA trademark + domain check
