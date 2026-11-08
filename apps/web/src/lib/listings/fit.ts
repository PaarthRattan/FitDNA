import { FIT_PARTS } from "@/lib/fit/constants";
import type { ChartRow, PhotoChart } from "@/lib/ai/tasks/listing-photos";
import { mergeMeasurements, partValue, predictFit, recommendSize } from "@/lib/fit/engine";
import { genericMeasurements } from "@/lib/fit/generic-sizes";
import { purchaseScore, type Condition, type PurchaseScore } from "@/lib/fit/score";
import type {
  BodyMeasurements,
  ChestBasis,
  FitPart,
  FitPrediction,
  GarmentCategory,
  GarmentMeasurements,
  MeasuredValue,
  MeasurementSource,
  ReferenceGarment,
  SizeChartRow,
  SizeRecommendation,
  Stretch,
} from "@/lib/fit/types";
import { CHEST_BASES, GARMENT_CATEGORIES, GARMENT_FIELDS, STRETCH_OPTIONS } from "@/lib/passport/fields";
import type { Assumption, ExtractedMeasurement, ListingCategory } from "./extract-measurements";

/**
 * A listing as one user sees it: the shared extractions, with that user's own
 * corrections on top, turned into fit-engine input. Pure, so it's unit-tested and
 * runs on every read (predictions are computed, not stored).
 */

export type ExtractionSource = "seller" | "size_chart" | "ai_text" | "ai_photo";

const EXTRACTION_SOURCES: ExtractionSource[] = ["seller", "size_chart", "ai_text", "ai_photo"];
const CONDITIONS: Condition[] = ["new", "like_new", "excellent", "good", "fair", "poor"];
const ASSUMPTIONS: Assumption[] = ["unit", "basis", "range"];

export interface ListingRowLike {
  title: string | null;
  size_label: string | null;
  condition: string | null;
  seller_rating: number | null;
}

export interface ExtractionRowLike {
  source: string;
  fields: unknown;
}

export interface OverrideRowLike {
  title: string | null;
  category: string | null;
  size_label: string | null;
  stretch: string | null;
  chest_cm: number | null;
  chest_basis: string | null;
  shoulder_cm: number | null;
  length_cm: number | null;
  sleeve_cm: number | null;
  cleared: string[];
}

export interface PartDetail {
  source: MeasurementSource;
  /** The seller's text this was read from. */
  span?: string;
  assumed: Assumption[];
}

export interface EffectiveListing {
  title: string | null;
  category: GarmentCategory | null;
  /** It looks like something other than a top or jacket, and the user hasn't said otherwise. */
  outOfScope: boolean;
  sizeLabel: string | null;
  stretch: Stretch;
  condition: Condition | null;
  measurements: GarmentMeasurements;
  details: Partial<Record<FitPart, PartDetail>>;
  /** The measurements are typical values for the size label, not this garment's own. */
  estimated: boolean;
}

// ---------------------------------------------------------------------------
// Reading stored rows. JSON and check-constrained text come back from the database
// loosely typed, so they're validated here rather than trusted.
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return options.find((o) => o === value) ?? null;
}

const PART_RANGE: Record<FitPart, { min: number; max: number }> = {
  chest: { min: GARMENT_FIELDS.chest.flat.min, max: GARMENT_FIELDS.chest.circumference.max },
  shoulder: GARMENT_FIELDS.shoulder,
  length: GARMENT_FIELDS.length,
  sleeve: GARMENT_FIELDS.sleeve,
};

function readMeasurement(part: FitPart, raw: unknown): ExtractedMeasurement | null {
  if (!isObject(raw) || typeof raw.cm !== "number" || !Number.isFinite(raw.cm)) return null;
  if (raw.cm < PART_RANGE[part].min || raw.cm > PART_RANGE[part].max) return null;
  const basis = oneOf<ChestBasis>(raw.basis, ["flat", "circumference"]);
  if (part === "chest" && !basis) return null;
  return {
    cm: raw.cm,
    ...(part === "chest" && { basis: basis! }),
    unit: raw.unit === "in" ? "in" : "cm",
    span: typeof raw.span === "string" ? raw.span.slice(0, 80) : "",
    assumed: Array.isArray(raw.assumed) ? raw.assumed.filter((a): a is Assumption => ASSUMPTIONS.includes(a)) : [],
  };
}

export interface StoredExtraction {
  source: ExtractionSource;
  measurements: Partial<Record<FitPart, ExtractedMeasurement>>;
  category: ListingCategory | null;
}

export function readExtraction(row: ExtractionRowLike): StoredExtraction | null {
  const source = oneOf(row.source, EXTRACTION_SOURCES);
  if (!source || !isObject(row.fields)) return null;
  const raw = isObject(row.fields.measurements) ? row.fields.measurements : {};
  const measurements: StoredExtraction["measurements"] = {};
  for (const part of FIT_PARTS) {
    const m = readMeasurement(part, raw[part]);
    if (m) measurements[part] = m;
  }
  const categories = [...GARMENT_CATEGORIES.map((c) => c.value), "out_of_scope"] as ListingCategory[];
  return { source, measurements, category: oneOf(row.fields.category, categories) };
}

function toGarment(measurements: StoredExtraction["measurements"], source: MeasurementSource): GarmentMeasurements {
  const out: GarmentMeasurements = {};
  for (const part of FIT_PARTS) {
    const m = measurements[part];
    if (!m) continue;
    if (part === "chest") out.chest = { cm: m.cm, basis: m.basis!, source };
    else out[part] = { cm: m.cm, source };
  }
  return out;
}

/** The user's corrections as engine measurements, all with source `user`. */
export function overrideMeasurements(override: OverrideRowLike | null): GarmentMeasurements {
  if (!override) return {};
  const out: GarmentMeasurements = {};
  const basis = oneOf<ChestBasis>(override.chest_basis, ["flat", "circumference"]);
  if (override.chest_cm !== null && basis) out.chest = { cm: override.chest_cm, basis, source: "user" };
  if (override.shoulder_cm !== null) out.shoulder = { cm: override.shoulder_cm, source: "user" };
  if (override.length_cm !== null) out.length = { cm: override.length_cm, source: "user" };
  if (override.sleeve_cm !== null) out.sleeve = { cm: override.sleeve_cm, source: "user" };
  return out;
}

/** What the listing itself says, best source first per part, before any user correction. */
export function listingBaseline(extractionRows: readonly ExtractionRowLike[]) {
  const extractions = extractionRows.map(readExtraction).filter((e): e is StoredExtraction => e !== null);
  extractions.sort((a, b) => EXTRACTION_SOURCES.indexOf(a.source) - EXTRACTION_SOURCES.indexOf(b.source));
  const measurements = mergeMeasurements(extractions.map((e) => toGarment(e.measurements, e.source)));
  const details: Partial<Record<FitPart, PartDetail>> = {};
  for (const part of FIT_PARTS) {
    const chosen = measurements[part];
    const from = chosen && extractions.find((e) => e.source === chosen.source)?.measurements[part];
    if (chosen && from) details[part] = { source: chosen.source, span: from.span || undefined, assumed: from.assumed };
  }
  return { measurements, details, category: extractions.find((e) => e.category)?.category ?? null };
}

export function effectiveListing(
  listing: ListingRowLike,
  extractionRows: readonly ExtractionRowLike[],
  override: OverrideRowLike | null,
): EffectiveListing {
  const baseline = listingBaseline(extractionRows);
  const user = overrideMeasurements(override);
  const measurements = mergeMeasurements([user, baseline.measurements]);
  const details: Partial<Record<FitPart, PartDetail>> = {};
  for (const part of FIT_PARTS) {
    if (user[part]) details[part] = { source: "user", assumed: [] };
    else if (override?.cleared.includes(part)) delete measurements[part];
    else if (baseline.details[part]) details[part] = baseline.details[part];
  }

  const chosenCategory = oneOf(override?.category, GARMENT_CATEGORIES.map((c) => c.value));
  const guessed = baseline.category === "out_of_scope" ? null : baseline.category;
  const category = chosenCategory ?? guessed;
  const sizeLabel = override?.size_label ?? listing.size_label;

  let estimated = false;
  let finalMeasurements = measurements;
  if (Object.keys(measurements).length === 0 && category && sizeLabel) {
    const generic = genericMeasurements(category, sizeLabel);
    if (generic) {
      finalMeasurements = generic;
      estimated = true;
      for (const part of FIT_PARTS) if (generic[part]) details[part] = { source: "estimated", assumed: [] };
    }
  }

  return {
    title: override?.title ?? listing.title,
    category,
    outOfScope: !chosenCategory && baseline.category === "out_of_scope",
    sizeLabel,
    stretch: oneOf(override?.stretch, STRETCH_OPTIONS.map((s) => s.value)) ?? "none",
    condition: oneOf(listing.condition, CONDITIONS),
    measurements: finalMeasurements,
    details,
    estimated,
  };
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

/** Why there's no prediction yet, so the page can say what would fix it. */
export type FitGap = "out_of_scope" | "category" | "measurements" | "passport";

export interface ListingFit {
  prediction: FitPrediction | null;
  score: PurchaseScore | null;
  gap: FitGap | null;
}

export interface FitContext {
  body: BodyMeasurements;
  references: ReferenceGarment[];
}

export function listingFit(effective: EffectiveListing, sellerRating: number | null, context: FitContext): ListingFit {
  const none = (gap: FitGap): ListingFit => ({ prediction: null, score: null, gap });
  if (effective.outOfScope) return none("out_of_scope");
  if (!effective.category) return none("category");
  if (Object.keys(effective.measurements).length === 0) return none("measurements");

  const prediction = predictFit({
    body: context.body,
    references: context.references,
    candidate: { category: effective.category, stretch: effective.stretch, measurements: effective.measurements },
  });
  if (prediction.overall === null) return none("passport");
  const score = purchaseScore({
    prediction,
    condition: effective.condition ?? undefined,
    sellerRating: sellerRating ?? undefined,
  });
  return { prediction, score, gap: null };
}

// ---------------------------------------------------------------------------
// Size charts
// ---------------------------------------------------------------------------

/** A stored size chart, validated: rows in cm, at least two sizes. */
export function readStoredChart(row: { chest_basis: string; rows: unknown; brand: string | null } | null): PhotoChart | null {
  if (!row || !Array.isArray(row.rows)) return null;
  const basis = oneOf<ChestBasis>(row.chest_basis, ["flat", "circumference"]);
  if (!basis) return null;
  const cm = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const rows: ChartRow[] = row.rows.flatMap((r) =>
    isObject(r) && typeof r.label === "string"
      ? [{ label: r.label.slice(0, 12), chest_cm: cm(r.chest_cm), shoulder_cm: cm(r.shoulder_cm), length_cm: cm(r.length_cm), sleeve_cm: cm(r.sleeve_cm) }]
      : [],
  );
  return rows.length >= 2 ? { brand: row.brand, chestBasis: basis, rows } : null;
}

/** Which size in the chart would fit the user best, by the same engine as everything else. */
export function sizeRecommendation(effective: EffectiveListing, chart: PhotoChart | null, context: FitContext): SizeRecommendation | null {
  if (!chart || !effective.category || effective.outOfScope) return null;
  const rows: SizeChartRow[] = chart.rows.map((r) => ({
    label: r.label,
    measurements: {
      ...(r.chest_cm !== null && { chest: { cm: r.chest_cm, basis: chart.chestBasis, source: "ai_photo" as const } }),
      ...(r.shoulder_cm !== null && { shoulder: { cm: r.shoulder_cm, source: "ai_photo" as const } }),
      ...(r.length_cm !== null && { length: { cm: r.length_cm, source: "ai_photo" as const } }),
      ...(r.sleeve_cm !== null && { sleeve: { cm: r.sleeve_cm, source: "ai_photo" as const } }),
    },
  }));
  const recommendation = recommendSize(
    {
      body: context.body,
      references: context.references,
      candidate: { category: effective.category, stretch: effective.stretch, measurements: effective.measurements },
    },
    rows,
  );
  return recommendation?.prediction.overall ? recommendation : null;
}

// ---------------------------------------------------------------------------
// Turning the confirm form into an override row
// ---------------------------------------------------------------------------

export interface ListingFormInput {
  title: string | null;
  category: GarmentCategory;
  sizeLabel: string | null;
  stretch: Stretch;
  chestCm: number | null;
  chestBasis: ChestBasis;
  shoulderCm: number | null;
  lengthCm: number | null;
  sleeveCm: number | null;
}

export interface OverrideValues {
  title: string | null;
  category: GarmentCategory;
  size_label: string | null;
  stretch: Stretch;
  chest_cm: number | null;
  chest_basis: ChestBasis | null;
  shoulder_cm: number | null;
  length_cm: number | null;
  sleeve_cm: number | null;
  cleared: FitPart[];
}

/** Values within this (cm, chest as a circumference) count as the listing's own number, unchanged. */
const SAME_CM = 0.15;

/**
 * Keeps only what the user actually changed. Confirming the seller's numbers as they
 * are stores nothing for them, so they stay `seller` measurements instead of turning
 * into higher-trust `user` ones. A field emptied where the listing had a value is
 * recorded as cleared.
 */
export function overrideFromForm(
  input: ListingFormInput,
  baseline: GarmentMeasurements,
  listing: Pick<ListingRowLike, "title" | "size_label">,
): OverrideValues {
  const typed: GarmentMeasurements = {};
  if (input.chestCm !== null) typed.chest = { cm: input.chestCm, basis: input.chestBasis, source: "user" };
  if (input.shoulderCm !== null) typed.shoulder = { cm: input.shoulderCm, source: "user" };
  if (input.lengthCm !== null) typed.length = { cm: input.lengthCm, source: "user" };
  if (input.sleeveCm !== null) typed.sleeve = { cm: input.sleeveCm, source: "user" };

  const cleared: FitPart[] = [];
  const kept: GarmentMeasurements = {};
  for (const part of FIT_PARTS) {
    const mine = partValue(typed, part);
    const theirs = partValue(baseline, part);
    if (!mine) {
      if (theirs) cleared.push(part);
    } else if (!theirs || Math.abs(mine.cm - theirs.cm) >= SAME_CM) {
      (kept as Record<FitPart, MeasuredValue>)[part] = typed[part]!;
    }
  }

  return {
    title: input.title && input.title !== listing.title ? input.title : null,
    category: input.category,
    size_label: input.sizeLabel && input.sizeLabel !== listing.size_label ? input.sizeLabel : null,
    stretch: input.stretch,
    chest_cm: kept.chest?.cm ?? null,
    chest_basis: kept.chest?.basis ?? null,
    shoulder_cm: kept.shoulder?.cm ?? null,
    length_cm: kept.length?.cm ?? null,
    sleeve_cm: kept.sleeve?.cm ?? null,
    cleared,
  };
}

const cmText = (v: MeasuredValue | undefined) => (v ? String(v.cm) : "");

/** The confirm form's starting values: what the user sees now, minus estimates (not this garment's numbers). */
export function formInitial(effective: EffectiveListing, override: OverrideRowLike | null): Record<string, string> {
  const m = effective.estimated ? {} : effective.measurements;
  return {
    title: override?.title ?? "",
    category: effective.category ?? "",
    sizeLabel: effective.sizeLabel ?? "",
    stretch: effective.stretch,
    unit: "cm",
    chest: cmText(m.chest),
    chestBasis: m.chest?.basis ?? CHEST_BASES[0].value,
    shoulder: cmText(m.shoulder),
    length: cmText(m.length),
    sleeve: cmText(m.sleeve),
  };
}
