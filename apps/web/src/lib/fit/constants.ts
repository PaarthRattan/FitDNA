import type { FitPart, GarmentCategory, MeasurementSource, Stretch } from "./types";

/**
 * Every tunable number in the fit engine lives here. They are informed starting
 * guesses, not calibrated values: post-purchase fit feedback (M7) is how they get
 * tuned. Change them here, never inline.
 */

/** Bump whenever a rule or constant changes, so saved prediction snapshots stay explainable. */
export const ENGINE_VERSION = "1";

/**
 * How far a measurement may differ before it moves one zone. Within `deadband` the
 * zone is unchanged; each further `step` moves one more zone. Chest is in
 * circumference cm; the rest are straight lengths.
 */
export const ZONE_STEPS: Record<FitPart, { deadband: number; step: number }> = {
  chest: { deadband: 3, step: 5 },
  shoulder: { deadband: 1.5, step: 2 },
  length: { deadband: 2, step: 4 },
  sleeve: { deadband: 2, step: 3 },
};

/**
 * Ease (garment minus body) that the average person reads as "ideal", used only when
 * the user has no reference garment of the same category. Chest is circumference.
 * Length has no body anchor (garment length depends on where the shoulder seam sits),
 * and tee sleeves are short, so neither is compared against the body.
 */
export const DEFAULT_IDEAL_EASE: Record<GarmentCategory, { chest: number; shoulder: number; sleeve: number | null }> = {
  tee: { chest: 10, shoulder: 1, sleeve: null },
  shirt: { chest: 12, shoulder: 1, sleeve: -1 },
  knit: { chest: 14, shoulder: 2, sleeve: -1 },
  jacket: { chest: 18, shoulder: 3, sleeve: 0 },
};

/** Extra chest room a stretchy garment gives before it reads as tight (cm). */
export const STRETCH_ALLOWANCE: Record<Stretch, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 4,
};

/** How much a measurement's source is trusted, 0–1. */
export const SOURCE_WEIGHT: Record<MeasurementSource, number> = {
  user: 1,
  seller: 0.9,
  size_chart: 0.8,
  ai_text: 0.75,
  ai_photo: 0.6,
  estimated: 0.35,
};

/** Source precedence, best first. */
export const SOURCE_RANK: MeasurementSource[] = ["user", "seller", "size_chart", "ai_text", "ai_photo", "estimated"];

/** A user-declared reference zone is near-certain; a body-only comparison less so. */
export const ANCHOR_WEIGHT = { reference: 0.95, body: 0.75 } as const;

/**
 * How much each part matters, for overall confidence and for picking the overall
 * zone. Shoulders can't be altered, so they matter as much as chest.
 */
export const PART_WEIGHT: Record<FitPart, number> = {
  chest: 1,
  shoulder: 1,
  length: 0.5,
  sleeve: 0.5,
};

/** Tie-break order when two parts are equally far from ideal. */
export const PART_PRIORITY: FitPart[] = ["shoulder", "chest", "length", "sleeve"];

export const FIT_PARTS: FitPart[] = ["chest", "shoulder", "length", "sleeve"];

/* ---------- Purchase Confidence Score ---------- */

/** Component weights. They re-normalise over whichever components are present. Fit is required. */
export const SCORE_WEIGHTS = { fit: 0.6, condition: 0.15, seller: 0.1, price: 0.15 } as const;

/** Fit component by distance from the user's ideal (0 = ideal, 2 = tight or oversized). */
export const FIT_ZONE_SCORE = [100, 70, 25] as const;

/** Share of the fit component that doesn't depend on measurement confidence. */
export const FIT_CONFIDENCE_FLOOR = 0.4;

export const CONDITION_SCORE = {
  new: 100,
  like_new: 90,
  excellent: 85,
  good: 70,
  fair: 45,
  poor: 20,
} as const;

/** Seller star rating at or below which the seller component is 0; 5 stars is 100. */
export const SELLER_RATING_FLOOR = 3;

/** Fewer price observations than this and the price component is left out. */
export const MIN_PRICE_HISTORY = 5;

/** A listing that "fits me": not tight or oversized, and at least this score. */
export const FITS_ME_MIN_SCORE = 70;
