import type { FitZone } from "@/lib/fit-zones";
import type { ChestBasis, GarmentCategory, Stretch } from "@/lib/fit/types";

/**
 * What the Fit Passport collects, with plain-language how-to notes and plausible
 * ranges (cm). Only the body measurements the fit engine actually uses are collected
 * (data minimisation); the database allows more for future categories.
 */

export const BODY_FIELDS = [
  {
    name: "chest",
    label: "Chest",
    how: "Around the fullest part of your chest, just under your arms. Keep the tape level and snug, not tight, and breathe out normally.",
    min: 60,
    max: 200,
  },
  {
    name: "shoulder",
    label: "Shoulder width",
    how: "Across your back, from the bony tip of one shoulder to the other, following the curve. Easiest with a helper.",
    min: 30,
    max: 70,
  },
  {
    name: "arm",
    label: "Arm length",
    how: "From the bony tip of your shoulder, down the outside of a slightly bent arm, to your wrist bone.",
    min: 40,
    max: 100,
  },
] as const;

export type BodyFieldName = (typeof BODY_FIELDS)[number]["name"];

/** Self-measured with a tape: how much we trust it (0–100) and its likely error (± cm). */
export const MANUAL_CONFIDENCE = 60;
export const MANUAL_RANGE_CM = 1.5;

export const GARMENT_CATEGORIES: ReadonlyArray<{ value: GarmentCategory; label: string }> = [
  { value: "tee", label: "T-shirt" },
  { value: "shirt", label: "Shirt" },
  { value: "knit", label: "Knit / sweater" },
  { value: "jacket", label: "Jacket" },
];

export const CHEST_BASES: ReadonlyArray<{ value: ChestBasis; label: string }> = [
  { value: "flat", label: "Pit to pit, laid flat" },
  { value: "circumference", label: "All the way around" },
];

export const STRETCH_OPTIONS: ReadonlyArray<{ value: Stretch; label: string }> = [
  { value: "none", label: "No stretch" },
  { value: "low", label: "A little" },
  { value: "medium", label: "Some" },
  { value: "high", label: "Very stretchy" },
];

/** Garment measurements, laid flat. Chest's range depends on its basis. */
export const GARMENT_FIELDS = {
  chest: {
    label: "Chest",
    how: "Lay it flat and measure straight across, armpit seam to armpit seam. Or tick “all the way around” if you measured the full circle.",
    flat: { min: 30, max: 100 },
    circumference: { min: 60, max: 200 },
  },
  shoulder: { label: "Shoulder", how: "Straight across the back, shoulder seam to shoulder seam.", min: 25, max: 80 },
  length: { label: "Length", how: "Down the back, from where the collar meets the shoulder to the hem.", min: 40, max: 120 },
  sleeve: { label: "Sleeve", how: "From the shoulder seam to the end of the cuff.", min: 10, max: 100 },
} as const;

export const FIT_ZONE_CHOICES: ReadonlyArray<{ value: FitZone; label: string; hint: string }> = [
  { value: "tight", label: "Tight", hint: "Restrictive; you'd go up a size" },
  { value: "fitted", label: "Fitted", hint: "Close to the body, the way you like some pieces" },
  { value: "ideal", label: "Ideal", hint: "Exactly how you want this kind of piece to fit" },
  { value: "relaxed", label: "Relaxed", hint: "Roomy but intentional" },
  { value: "oversized", label: "Oversized", hint: "Much bigger or longer than your ideal" },
];

export const PREFERENCE_MAX_LENGTH = 500;
export const TITLE_MAX_LENGTH = 80;
export const SIZE_MAX_LENGTH = 20;

/** Version of the consent text in /passport/consent. Bump it whenever that text changes. */
export const CONSENT_POLICY_VERSION = "2026-11-16";
