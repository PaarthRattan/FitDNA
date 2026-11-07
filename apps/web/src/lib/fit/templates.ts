import type { FitZone } from "@/lib/fit-zones";
import { PART_PRIORITY, ZONE_STEPS } from "./constants";
import type { FitPart, GarmentCategory, PartResult } from "./types";

/**
 * Plain-English verdicts built from engine output. Deterministic on purpose: every
 * number in the sentence comes straight from the prediction.
 */

const HEADLINE: Record<FitZone, string> = {
  tight: "Likely tight",
  fitted: "Fitted",
  ideal: "Your kind of fit",
  relaxed: "Relaxed",
  oversized: "Likely oversized",
};

const CATEGORY_NOUN: Record<GarmentCategory, string> = {
  tee: "tee",
  shirt: "shirt",
  knit: "knit",
  jacket: "jacket",
};

/** Words for a negative / positive difference, and where on the garment. */
const PART_WORDS: Record<FitPart, { less: string; more: string; where: string }> = {
  chest: { less: "narrower", more: "wider", where: "through the chest" },
  shoulder: { less: "narrower", more: "wider", where: "in the shoulders" },
  length: { less: "shorter", more: "longer", where: "in the body" },
  sleeve: { less: "shorter", more: "longer", where: "in the sleeve" },
};

export function formatCm(cm: number): string {
  const rounded = Math.round(Math.abs(cm) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** The part whose difference is largest relative to how much that part tolerates. */
function headlinePart(parts: Record<FitPart, PartResult>): PartResult | undefined {
  return PART_PRIORITY.map((p) => parts[p])
    .filter((r) => r.deltaCm !== null && r.anchor.kind !== "none")
    .reduce<PartResult | undefined>((best, r) => {
      if (!best) return r;
      return Math.abs(r.deltaCm!) / ZONE_STEPS[r.part].step > Math.abs(best.deltaCm!) / ZONE_STEPS[best.part].step
        ? r
        : best;
    }, undefined);
}

function describe(result: PartResult, category: GarmentCategory): string {
  const words = PART_WORDS[result.part];
  const delta = result.deltaCm!;
  const amount = formatCm(delta);
  // `result` is the largest difference, so a zero here means every compared part matches.
  if (result.anchor.kind === "reference") {
    if (amount === "0") return `matches your ${result.anchor.referenceTitle}`;
    return `${amount} cm ${delta < 0 ? words.less : words.more} ${words.where} than your ${result.anchor.referenceTitle}`;
  }
  const noun = CATEGORY_NOUN[category];
  if (amount === "0") return `cut like a typical ${noun} on you`;
  return `${amount} cm ${delta < 0 ? words.less : words.more} ${words.where} than a typical ${noun} on you`;
}

export function buildVerdict(
  overall: FitZone | null,
  parts: Record<FitPart, PartResult>,
  category: GarmentCategory,
): string {
  if (overall === null) return "Not enough measurements to predict the fit yet.";
  const part = headlinePart(parts);
  return part ? `${HEADLINE[overall]} — ${describe(part, category)}.` : `${HEADLINE[overall]}.`;
}
