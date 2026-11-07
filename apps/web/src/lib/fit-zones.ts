/** The five fit zones. Tint colours come from the Dell '96 ribbon-card family. */
export type FitZone = "tight" | "fitted" | "ideal" | "relaxed" | "oversized";

export interface FitZoneMeta {
  label: string;
  legend: string;
  /** Tailwind background class (literal so Tailwind can see it). */
  bg: string;
}

export const FIT_ZONES: Record<FitZone, FitZoneMeta> = {
  tight: { label: "TIGHT", legend: "Tight / restrictive", bg: "bg-tint-salmon" },
  fitted: { label: "FITTED", legend: "Fitted", bg: "bg-tint-peach" },
  ideal: { label: "IDEAL", legend: "Ideal (your definition)", bg: "bg-tint-lime" },
  relaxed: { label: "RELAXED", legend: "Relaxed", bg: "bg-tint-sky" },
  oversized: { label: "OVERSIZED", legend: "Oversized / long", bg: "bg-tint-periwinkle" },
};

export const FIT_ZONE_ORDER: FitZone[] = ["tight", "fitted", "ideal", "relaxed", "oversized"];
