import { FIT_ZONE_ORDER, type FitZone } from "@/lib/fit-zones";
import { FIT_PARTS } from "@/lib/fit/constants";
import { zoneIndex } from "@/lib/fit/engine";
import type { FitPart } from "@/lib/fit/types";
import { text, type FieldErrors, type Parsed } from "@/lib/passport/parse";

/**
 * Post-purchase fit checks: what was predicted (the snapshot saved with "I bought
 * this") against how it actually fit. Pure, so it's unit-tested.
 */

const asZone = (v: unknown): FitZone | null => FIT_ZONE_ORDER.find((z) => z === v) ?? null;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export interface Snapshot {
  overall: FitZone | null;
  parts: Record<FitPart, FitZone | null>;
  verdict: string | null;
  engineVersion: string | null;
}

/** A purchase's stored prediction, validated: it's JSON from the database. */
export function readSnapshot(json: unknown): Snapshot {
  const raw = isObject(json) ? json : {};
  const parts = isObject(raw.parts) ? raw.parts : {};
  return {
    overall: asZone(raw.overall),
    parts: Object.fromEntries(FIT_PARTS.map((p) => [p, asZone(isObject(parts[p]) ? parts[p].zone : null)])) as Record<FitPart, FitZone | null>,
    verdict: typeof raw.verdict === "string" ? raw.verdict.slice(0, 300) : null,
    engineVersion: typeof raw.engineVersion === "string" ? raw.engineVersion.slice(0, 40) : null,
  };
}

export interface FeedbackInput {
  overall: FitZone;
  parts: Partial<Record<FitPart, FitZone>>;
  kept: boolean | null;
}

export const FEEDBACK_FIELDS = ["id", "overall", ...FIT_PARTS, "kept"] as const;

/** The fit-check form: overall fit is required; each part and "did you keep it" are optional. */
export function parseFeedbackForm(fd: FormData): Parsed<FeedbackInput> {
  const errors: FieldErrors = {};
  const overall = asZone(text(fd, "overall"));
  if (!overall) errors.overall = "Choose how it fits overall.";
  const parts: Partial<Record<FitPart, FitZone>> = {};
  for (const part of FIT_PARTS) {
    const raw = text(fd, part);
    if (!raw) continue;
    const zone = asZone(raw);
    if (zone) parts[part] = zone;
    else errors[part] = "Choose one of the fits, or leave it as not sure.";
  }
  const keptRaw = text(fd, "kept");
  const kept = keptRaw === "yes" ? true : keptRaw === "no" ? false : null;
  if (keptRaw && kept === null) errors.kept = "Choose whether you kept it.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { overall: overall!, parts, kept } };
}

export type Agreement = "match" | "close" | "off";

/** How far the actual fit was from the prediction, in zones (+ looser, − tighter). */
export function compareZones(predicted: FitZone | null, actual: FitZone | null): { steps: number; agreement: Agreement } | null {
  if (!predicted || !actual) return null;
  const steps = zoneIndex(actual) - zoneIndex(predicted);
  return { steps, agreement: steps === 0 ? "match" : Math.abs(steps) === 1 ? "close" : "off" };
}

/** "Spot on", "a little looser than predicted", "much tighter than predicted". */
export function describeComparison(predicted: FitZone | null, actual: FitZone | null): string | null {
  const c = compareZones(predicted, actual);
  if (!c) return null;
  if (c.agreement === "match") return "Spot on";
  const way = c.steps > 0 ? "looser" : "tighter";
  return c.agreement === "close" ? `A little ${way} than predicted` : `Much ${way} than predicted`;
}

/** How often predictions matched, over the answered fit checks. */
export function agreementSummary(pairs: ReadonlyArray<{ predicted: FitZone | null; actual: FitZone | null }>) {
  const compared = pairs.map((p) => compareZones(p.predicted, p.actual)).filter((c) => c !== null);
  return {
    answered: compared.length,
    match: compared.filter((c) => c.agreement === "match").length,
    close: compared.filter((c) => c.agreement === "close").length,
    off: compared.filter((c) => c.agreement === "off").length,
  };
}
