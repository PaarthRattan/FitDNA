import type { FitZone } from "@/lib/fit-zones";
import {
  CONDITION_SCORE,
  FIT_CONFIDENCE_FLOOR,
  FIT_ZONE_SCORE,
  FITS_ME_MIN_SCORE,
  MIN_PRICE_HISTORY,
  SCORE_WEIGHTS,
  SELLER_RATING_FLOOR,
} from "./constants";
import { zoneIndex } from "./engine";
import type { FitPrediction } from "./types";

export type Condition = keyof typeof CONDITION_SCORE;

export type ScoreKey = keyof typeof SCORE_WEIGHTS;

export interface ScoreInput {
  prediction: FitPrediction;
  condition?: Condition;
  /** Seller star rating, 0–5. */
  sellerRating?: number;
  price?: number;
  /** Past prices seen for comparable listings, same currency. */
  priceHistory?: number[];
}

export interface ScoreComponent {
  key: ScoreKey;
  /** 0–100, or null when there isn't enough data. */
  value: number | null;
  weight: number;
}

export interface PurchaseScore {
  /** 0–100, or null when fit can't be predicted. */
  score: number | null;
  components: ScoreComponent[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

function fitComponent(prediction: FitPrediction): number | null {
  if (prediction.overall === null) return null;
  const base = FIT_ZONE_SCORE[Math.abs(zoneIndex(prediction.overall))];
  return base * (FIT_CONFIDENCE_FLOOR + (1 - FIT_CONFIDENCE_FLOOR) * (prediction.confidence / 100));
}

function sellerComponent(rating?: number): number | null {
  if (rating === undefined) return null;
  return clamp(((rating - SELLER_RATING_FLOOR) / (5 - SELLER_RATING_FLOOR)) * 100);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 50 at the median price; each 1% under the median adds a point. */
function priceComponent(price?: number, history?: number[]): number | null {
  if (price === undefined || !history || history.length < MIN_PRICE_HISTORY) return null;
  const mid = median(history);
  if (mid <= 0) return null;
  return clamp(50 + ((mid - price) / mid) * 100);
}

/**
 * The Purchase Confidence Score: a weighted blend of fit, condition, seller and price.
 * Missing components are left out and the rest re-weighted, and every component is
 * returned so the UI can say what the score is (and isn't) based on.
 */
export function purchaseScore(input: ScoreInput): PurchaseScore {
  const values: Record<ScoreKey, number | null> = {
    fit: fitComponent(input.prediction),
    condition: input.condition ? CONDITION_SCORE[input.condition] : null,
    seller: sellerComponent(input.sellerRating),
    price: priceComponent(input.price, input.priceHistory),
  };
  const components = (Object.keys(SCORE_WEIGHTS) as ScoreKey[]).map((key) => ({
    key,
    value: values[key] === null ? null : Math.round(values[key]),
    weight: SCORE_WEIGHTS[key],
  }));
  if (values.fit === null) return { score: null, components };

  const present = (Object.keys(SCORE_WEIGHTS) as ScoreKey[]).filter((k) => values[k] !== null);
  const totalWeight = present.reduce((sum, k) => sum + SCORE_WEIGHTS[k], 0);
  const score = present.reduce((sum, k) => sum + SCORE_WEIGHTS[k] * values[k]!, 0) / totalWeight;
  return { score: Math.round(score), components };
}

/** A listing passes the "fits me" filter when it isn't tight or oversized and scores well. */
export function fitsMe(overall: FitZone | null, score: number | null): boolean {
  return overall !== null && overall !== "tight" && overall !== "oversized" && (score ?? 0) >= FITS_ME_MIN_SCORE;
}
