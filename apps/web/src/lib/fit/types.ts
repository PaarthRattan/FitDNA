import type { FitZone } from "@/lib/fit-zones";

/** v1 scope is tops and jackets. Each category is compared against a reference of the same category. */
export type GarmentCategory = "tee" | "shirt" | "knit" | "jacket";

/** The body parts a prediction covers, and the fit map shows. */
export type FitPart = "chest" | "shoulder" | "length" | "sleeve";

/**
 * Where a garment measurement came from, best first. The engine always reads the
 * highest-ranked value available for each part, and weights its confidence by source.
 */
export type MeasurementSource = "user" | "seller" | "size_chart" | "ai_text" | "ai_photo" | "estimated";

/**
 * "Pit to pit" is a flat width across the garment; body chest is a circumference.
 * Only chest needs this: shoulder, length and sleeve are always straight-line lengths.
 */
export type ChestBasis = "flat" | "circumference";

export type Stretch = "none" | "low" | "medium" | "high";

export interface MeasuredValue {
  cm: number;
  source: MeasurementSource;
}

export interface ChestValue extends MeasuredValue {
  basis: ChestBasis;
}

/** One garment's measurements. Any part may be unknown. */
export interface GarmentMeasurements {
  chest?: ChestValue;
  shoulder?: MeasuredValue;
  length?: MeasuredValue;
  sleeve?: MeasuredValue;
}

/** A garment the user owns and has told us how it fits them. */
export interface ReferenceGarment {
  id: string;
  title: string;
  category: GarmentCategory;
  /** How this piece fits the user, in their own judgement. Anchors every comparison. */
  zone: FitZone;
  measurements: GarmentMeasurements;
}

export interface BodyValue {
  cm: number;
  /** 0–100, from the scan vendor or 60 for manual entry. */
  confidence: number;
}

/** Body measurements the engine can use. All circumferences except shoulder and arm. */
export interface BodyMeasurements {
  chest?: BodyValue;
  shoulder?: BodyValue;
  arm?: BodyValue;
}

export interface CandidateGarment {
  category: GarmentCategory;
  stretch?: Stretch;
  measurements: GarmentMeasurements;
}

export interface SizeChartRow {
  label: string;
  measurements: GarmentMeasurements;
}

export interface FitInput {
  body: BodyMeasurements;
  references: ReferenceGarment[];
  candidate: CandidateGarment;
}

/** What a part was compared against. */
export type Anchor =
  | { kind: "reference"; referenceId: string; referenceTitle: string }
  | { kind: "body" }
  | { kind: "none" };

export interface PartResult {
  part: FitPart;
  /** Null when there was nothing to compare against. */
  zone: FitZone | null;
  /** Candidate minus anchor, in cm (circumference for chest). Null when unanchored. */
  deltaCm: number | null;
  anchor: Anchor;
  source: MeasurementSource | null;
  /** 0–1. */
  confidence: number;
}

export interface FitPrediction {
  engineVersion: string;
  parts: Record<FitPart, PartResult>;
  /** Null only when no part could be compared at all. */
  overall: FitZone | null;
  /** 0–100. */
  confidence: number;
  verdict: string;
}

export interface SizeRecommendation {
  label: string;
  prediction: FitPrediction;
  /** Every size evaluated, best first. */
  ranked: Array<{ label: string; overall: FitZone | null; severity: number }>;
}
