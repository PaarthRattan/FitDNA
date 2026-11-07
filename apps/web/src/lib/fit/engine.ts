import { FIT_ZONE_ORDER, type FitZone } from "@/lib/fit-zones";
import {
  ANCHOR_WEIGHT,
  DEFAULT_IDEAL_EASE,
  ENGINE_VERSION,
  FIT_PARTS,
  PART_PRIORITY,
  PART_WEIGHT,
  SOURCE_RANK,
  SOURCE_WEIGHT,
  STRETCH_ALLOWANCE,
  ZONE_STEPS,
} from "./constants";
import { buildVerdict } from "./templates";
import type {
  BodyMeasurements,
  CandidateGarment,
  ChestValue,
  FitInput,
  FitPart,
  FitPrediction,
  GarmentCategory,
  GarmentMeasurements,
  MeasuredValue,
  PartResult,
  ReferenceGarment,
  SizeChartRow,
  SizeRecommendation,
} from "./types";

/** Zones as signed steps from ideal: tight −2 … oversized +2. */
export function zoneIndex(zone: FitZone): number {
  return FIT_ZONE_ORDER.indexOf(zone) - 2;
}

export function zoneAt(index: number): FitZone {
  const clamped = Math.max(-2, Math.min(2, index));
  return FIT_ZONE_ORDER[clamped + 2];
}

/** Rounds to 0.1 cm so floating-point noise never tips a value across a threshold. */
function roundCm(cm: number): number {
  return Math.round(cm * 10) / 10;
}

/** How many zones a difference moves, given a part's deadband and step. */
export function zoneShift(part: FitPart, deltaCm: number): number {
  const { deadband, step } = ZONE_STEPS[part];
  const excess = roundCm(Math.abs(roundCm(deltaCm)) - deadband);
  if (excess <= 0) return 0;
  // The epsilon keeps an exact multiple of the step (e.g. 5.0 / 5) from flooring low.
  return Math.sign(deltaCm) * (1 + Math.floor(excess / step + 1e-9));
}

/** A garment's value for a part, in comparable units: chest always as a circumference. */
export function partValue(measurements: GarmentMeasurements, part: FitPart): MeasuredValue | undefined {
  if (part === "chest") {
    const chest = measurements.chest;
    if (!chest) return undefined;
    return { cm: chest.basis === "flat" ? chest.cm * 2 : chest.cm, source: chest.source };
  }
  return measurements[part];
}

/**
 * Merges several measurement sets for one garment (e.g. the user's override, the
 * seller's numbers and an AI extraction), keeping the highest-ranked source per part.
 */
export function mergeMeasurements(sets: GarmentMeasurements[]): GarmentMeasurements {
  const merged: GarmentMeasurements = {};
  for (const part of FIT_PARTS) {
    let best: MeasuredValue | ChestValue | undefined;
    for (const set of sets) {
      const value = set[part];
      if (value && (!best || SOURCE_RANK.indexOf(value.source) < SOURCE_RANK.indexOf(best.source))) {
        best = value;
      }
    }
    if (best) (merged as Record<FitPart, MeasuredValue>)[part] = best;
  }
  return merged;
}

/**
 * The reference to compare a part against: same category, has that part, and closest
 * to the user's ideal (so "ideal" references anchor before "fitted" ones).
 */
function pickReference(references: ReferenceGarment[], category: GarmentCategory, part: FitPart) {
  return references
    .filter((r) => r.category === category && partValue(r.measurements, part))
    .sort((a, b) => Math.abs(zoneIndex(a.zone)) - Math.abs(zoneIndex(b.zone)))[0];
}

/** Stretch lets a garment come in a little under its anchor before it reads as tight. */
function effectiveDelta(part: FitPart, deltaCm: number, candidate: CandidateGarment): number {
  if (part !== "chest" || deltaCm >= 0) return deltaCm;
  return Math.min(0, deltaCm + STRETCH_ALLOWANCE[candidate.stretch ?? "none"]);
}

/** Body-anchored comparison: candidate ease minus the category's default ideal ease. */
function bodyDelta(part: FitPart, value: number, body: BodyMeasurements, category: GarmentCategory) {
  const ideal = DEFAULT_IDEAL_EASE[category];
  if (part === "chest" && body.chest) return { delta: value - body.chest.cm - ideal.chest, body: body.chest };
  if (part === "shoulder" && body.shoulder) return { delta: value - body.shoulder.cm - ideal.shoulder, body: body.shoulder };
  if (part === "sleeve" && body.arm && ideal.sleeve !== null) {
    return { delta: value - body.arm.cm - ideal.sleeve, body: body.arm };
  }
  return undefined;
}

function predictPart(part: FitPart, input: FitInput): PartResult {
  const { candidate, references, body } = input;
  const value = partValue(candidate.measurements, part);
  if (!value) {
    return { part, zone: null, deltaCm: null, anchor: { kind: "none" }, source: null, confidence: 0 };
  }

  const reference = pickReference(references, candidate.category, part);
  if (reference) {
    const refValue = partValue(reference.measurements, part)!;
    const delta = roundCm(value.cm - refValue.cm);
    const shift = zoneShift(part, effectiveDelta(part, delta, candidate));
    return {
      part,
      zone: zoneAt(zoneIndex(reference.zone) + shift),
      deltaCm: delta,
      anchor: { kind: "reference", referenceId: reference.id, referenceTitle: reference.title },
      source: value.source,
      confidence: SOURCE_WEIGHT[value.source] * SOURCE_WEIGHT[refValue.source] * ANCHOR_WEIGHT.reference,
    };
  }

  const fromBody = bodyDelta(part, value.cm, body, candidate.category);
  if (fromBody) {
    const delta = roundCm(fromBody.delta);
    return {
      part,
      zone: zoneAt(zoneShift(part, effectiveDelta(part, delta, candidate))),
      deltaCm: delta,
      anchor: { kind: "body" },
      source: value.source,
      confidence: SOURCE_WEIGHT[value.source] * ANCHOR_WEIGHT.body * (fromBody.body.confidence / 100),
    };
  }

  return { part, zone: null, deltaCm: null, anchor: { kind: "none" }, source: value.source, confidence: 0 };
}

function severity(result: PartResult): number {
  return result.zone === null ? 0 : Math.abs(zoneIndex(result.zone)) * PART_WEIGHT[result.part];
}

/**
 * The overall zone is the part furthest from the user's ideal, weighted so chest and
 * shoulders count more than length and sleeve. Ties go to shoulders first: they can't
 * be altered.
 */
function overallZone(parts: Record<FitPart, PartResult>): FitZone | null {
  const zoned = PART_PRIORITY.map((p) => parts[p]).filter((r) => r.zone !== null);
  if (zoned.length === 0) return null;
  return zoned.reduce((worst, r) => (severity(r) > severity(worst) ? r : worst)).zone;
}

/** Predicts how a candidate garment will fit, part by part. Pure: no I/O. */
export function predictFit(input: FitInput): FitPrediction {
  const parts = Object.fromEntries(FIT_PARTS.map((p) => [p, predictPart(p, input)])) as Record<FitPart, PartResult>;
  const overall = overallZone(parts);
  const totalWeight = FIT_PARTS.reduce((sum, p) => sum + PART_WEIGHT[p], 0);
  const weighted = FIT_PARTS.reduce((sum, p) => sum + PART_WEIGHT[p] * parts[p].confidence, 0);
  return {
    engineVersion: ENGINE_VERSION,
    parts,
    overall,
    confidence: Math.round((weighted / totalWeight) * 100),
    verdict: buildVerdict(overall, parts, input.candidate.category),
  };
}

/** Total weighted distance from ideal, plus a fraction for how far inside each zone. */
function sizeDistance(prediction: FitPrediction): number {
  return FIT_PARTS.reduce((sum, p) => {
    const r = prediction.parts[p];
    if (r.zone === null || r.deltaCm === null) return sum;
    return sum + severity(r) + Math.abs(r.deltaCm) / (ZONE_STEPS[p].step * 100);
  }, 0);
}

/** A size chart row's own numbers, falling back to the candidate's for anything the row lacks. */
function rowMeasurements(row: SizeChartRow, fallback: GarmentMeasurements): GarmentMeasurements {
  const out: GarmentMeasurements = {};
  for (const part of FIT_PARTS) {
    const value = row.measurements[part] ?? fallback[part];
    if (value) (out as Record<FitPart, MeasuredValue>)[part] = value;
  }
  return out;
}

/**
 * Evaluates every row of a size chart and returns the best fit. Each row's numbers
 * describe that size, so they take precedence over the candidate's own measurements
 * (which describe only the listed size) regardless of source rank.
 */
export function recommendSize(input: FitInput, chart: SizeChartRow[]): SizeRecommendation | null {
  if (chart.length === 0) return null;
  const evaluated = chart.map((row) => {
    const measurements = rowMeasurements(row, input.candidate.measurements);
    const prediction = predictFit({ ...input, candidate: { ...input.candidate, measurements } });
    return { label: row.label, prediction, distance: sizeDistance(prediction) };
  });
  evaluated.sort((a, b) => a.distance - b.distance || b.prediction.confidence - a.prediction.confidence);
  const best = evaluated[0];
  return {
    label: best.label,
    prediction: best.prediction,
    ranked: evaluated.map((e) => ({ label: e.label, overall: e.prediction.overall, severity: e.distance })),
  };
}
