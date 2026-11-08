import type { Condition, ScoreKey } from "@/lib/fit/score";
import type { FitPart, MeasurementSource } from "@/lib/fit/types";
import type { EffectiveListing, FitGap } from "./fit";

/** Words for listing pages. Kept apart from the pages so every page says the same thing. */

export const PART_LABELS: Record<FitPart, string> = {
  chest: "Chest",
  shoulder: "Shoulders",
  length: "Body length",
  sleeve: "Sleeve",
};

export const SOURCE_LABELS: Record<MeasurementSource, string> = {
  user: "your correction",
  seller: "the seller",
  size_chart: "the size chart",
  ai_text: "read by AI from the description",
  ai_photo: "read by AI from a photo",
  estimated: "typical for the size",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  like_new: "Like new",
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const SCORE_LABELS: Record<ScoreKey, { label: string; missing: string }> = {
  fit: { label: "Predicted fit", missing: "Can't predict yet" },
  condition: { label: "Condition", missing: "Not stated" },
  seller: { label: "Seller rating", missing: "Not known" },
  price: { label: "Price vs. history", missing: "Not enough price history yet" },
};

export const GAP_MESSAGES: Record<FitGap | "signed_out", string> = {
  signed_out: "Sign in to see how this fits you.",
  out_of_scope: "This doesn't look like a top or jacket, and FitDNA only predicts those for now. If it is one, say which kind.",
  category: "Say what kind of garment this is, so it can be compared with one of yours.",
  measurements: "No measurements yet. Add them from the listing's description or photos.",
  passport: "Nothing to compare it with yet. Add one of your own garments of this kind, or your body measurements.",
};

/** Where the gap's fix lives. */
export function gapHref(gap: FitGap | "signed_out", listingId: string): string {
  if (gap === "signed_out") return `/login?next=${encodeURIComponent(`/search/${listingId}`)}`;
  if (gap === "passport") return "/passport/garments/new";
  return `/listings/${listingId}/edit`;
}

export const GAP_ACTIONS: Record<FitGap | "signed_out", string> = {
  signed_out: "Sign in",
  out_of_scope: "Choose the kind",
  category: "Choose the kind",
  measurements: "Add measurements",
  passport: "Add a garment",
};

/** One line on where the numbers came from. */
export function basisNote(effective: EffectiveListing): string {
  if (effective.estimated) {
    return `Based on typical measurements for size ${effective.sizeLabel}, not this garment's own, so treat it as a rough guide.`;
  }
  const sources = new Set(Object.values(effective.details).map((d) => d.source));
  if (sources.size === 0) return "";
  if (sources.size === 1 && sources.has("user")) return "Based on the measurements you entered.";
  if (sources.has("user")) return "Based on the seller's measurements, with your corrections.";
  return "Based on the seller's measurements.";
}

/** Chips for a listing card: size, condition, where the measurements came from. */
export function listingChips(effective: EffectiveListing, opts: { sellerRating: number | null; isDemo: boolean }): string[] {
  const chips: string[] = [];
  if (opts.isDemo) chips.push("DEMO");
  if (effective.sizeLabel) chips.push(`SIZE ${effective.sizeLabel.toUpperCase()}`);
  if (effective.condition) chips.push(CONDITION_LABELS[effective.condition].toUpperCase());
  if (opts.sellerRating !== null) chips.push(`SELLER ${opts.sellerRating.toFixed(1)}★`);
  const measured = Object.keys(effective.measurements).length;
  if (effective.estimated) chips.push("ESTIMATED FROM SIZE");
  else if (measured === 0) chips.push("NO MEASUREMENTS");
  else chips.push(`${measured} OF 4 MEASUREMENTS`);
  return chips;
}

export function formatPrice(price: number | null, currency: string | null): string {
  if (price === null || currency === null) return "Price not read";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}
