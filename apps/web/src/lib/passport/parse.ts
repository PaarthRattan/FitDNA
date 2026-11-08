import type { FitZone } from "@/lib/fit-zones";
import { FIT_ZONE_ORDER } from "@/lib/fit-zones";
import type { ChestBasis, GarmentCategory, Stretch } from "@/lib/fit/types";
import {
  BODY_FIELDS,
  CHEST_BASES,
  GARMENT_CATEGORIES,
  GARMENT_FIELDS,
  PREFERENCE_MAX_LENGTH,
  SIZE_MAX_LENGTH,
  STRETCH_OPTIONS,
  TITLE_MAX_LENGTH,
  type BodyFieldName,
} from "./fields";

/**
 * Parsing for the Fit Passport forms. Everything from a form is untrusted: these
 * functions turn raw FormData into validated values (always in cm), or into
 * per-field messages the form can show next to each input.
 */

export type Unit = "cm" | "in";
export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const CM_PER_INCH = 2.54;

export function text(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** Accepts "96", "96.5" and "96,5". Empty is null; anything else that isn't a positive number is NaN. */
function number(fd: FormData, name: string): number | null {
  const raw = text(fd, name).replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && /^\d+(\.\d+)?$/.test(raw) ? n : NaN;
}

export function unit(fd: FormData): Unit | null {
  const u = text(fd, "unit") || "cm";
  return u === "cm" || u === "in" ? u : null;
}

export function toCm(value: number, from: Unit): number {
  return Math.round((from === "in" ? value * CM_PER_INCH : value) * 10) / 10;
}

function rangeMessage(label: string, min: number, max: number): string {
  const inches = (cm: number) => Math.round(cm / CM_PER_INCH);
  return `${label} should be between ${min} and ${max} cm (${inches(min)}–${inches(max)} in).`;
}

export function oneOf<T extends string>(value: string, options: ReadonlyArray<{ value: T }>): T | null {
  return options.find((o) => o.value === value)?.value ?? null;
}

/** Reads a measurement in the form's unit, checks it against a range in cm. */
export function measurement(fd: FormData, name: string, from: Unit, label: string, range: { min: number; max: number }, errors: FieldErrors) {
  const raw = number(fd, name);
  if (raw === null) return null;
  if (Number.isNaN(raw)) {
    errors[name] = `${label} should be a number, like 96 or 96.5.`;
    return null;
  }
  const cm = toCm(raw, from);
  if (cm < range.min || cm > range.max) {
    errors[name] = rangeMessage(label, range.min, range.max);
    return null;
  }
  return cm;
}

export type BodyInput = Partial<Record<BodyFieldName, number>>;

/** Body measurements. Blank fields mean "remove this measurement"; at least one is required. */
export function parseBodyForm(fd: FormData): Parsed<BodyInput> {
  const errors: FieldErrors = {};
  const from = unit(fd);
  if (!from) return { ok: false, errors: { unit: "Choose centimetres or inches." } };

  const value: BodyInput = {};
  for (const field of BODY_FIELDS) {
    const cm = measurement(fd, field.name, from, field.label, field, errors);
    if (cm !== null) value[field.name] = cm;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  if (Object.keys(value).length === 0) return { ok: false, errors: { form: "Enter at least one measurement." } };
  return { ok: true, value };
}

export interface GarmentInput {
  title: string;
  category: GarmentCategory;
  sizeLabel: string | null;
  chestCm: number;
  chestBasis: ChestBasis;
  shoulderCm: number | null;
  lengthCm: number | null;
  sleeveCm: number | null;
  stretch: Stretch;
  fitZone: FitZone;
}

/** A reference garment. Chest is required; it anchors most of the prediction. */
export function parseGarmentForm(fd: FormData): Parsed<GarmentInput> {
  const errors: FieldErrors = {};
  const from = unit(fd);
  if (!from) errors.unit = "Choose centimetres or inches.";

  const title = text(fd, "title");
  if (!title) errors.title = "Give it a name you'll recognise, like “grey zip-up”.";
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `Keep the name under ${TITLE_MAX_LENGTH} characters.`;

  const category = oneOf(text(fd, "category"), GARMENT_CATEGORIES);
  if (!category) errors.category = "Choose what kind of garment it is.";

  const sizeLabel = text(fd, "sizeLabel");
  if (sizeLabel.length > SIZE_MAX_LENGTH) errors.sizeLabel = `Keep the size under ${SIZE_MAX_LENGTH} characters.`;

  const chestBasis = oneOf(text(fd, "chestBasis") || "flat", CHEST_BASES);
  if (!chestBasis) errors.chestBasis = "Choose how you measured the chest.";

  const stretch = oneOf(text(fd, "stretch") || "none", STRETCH_OPTIONS);
  if (!stretch) errors.stretch = "Choose how stretchy it is.";

  const zone = text(fd, "fitZone");
  const fitZone = (FIT_ZONE_ORDER as string[]).includes(zone) ? (zone as FitZone) : null;
  if (!fitZone) errors.fitZone = "Choose how it fits you.";

  let chestCm: number | null = null;
  let shoulderCm: number | null = null;
  let lengthCm: number | null = null;
  let sleeveCm: number | null = null;
  if (from) {
    const chestRange = GARMENT_FIELDS.chest[chestBasis ?? "flat"];
    chestCm = measurement(fd, "chest", from, GARMENT_FIELDS.chest.label, chestRange, errors);
    if (chestCm === null && !errors.chest) errors.chest = "Chest is needed: it's what most predictions hinge on.";
    shoulderCm = measurement(fd, "shoulder", from, GARMENT_FIELDS.shoulder.label, GARMENT_FIELDS.shoulder, errors);
    lengthCm = measurement(fd, "length", from, GARMENT_FIELDS.length.label, GARMENT_FIELDS.length, errors);
    sleeveCm = measurement(fd, "sleeve", from, GARMENT_FIELDS.sleeve.label, GARMENT_FIELDS.sleeve, errors);
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      category: category!,
      sizeLabel: sizeLabel || null,
      chestCm: chestCm!,
      chestBasis: chestBasis!,
      shoulderCm,
      lengthCm,
      sleeveCm,
      stretch: stretch!,
      fitZone: fitZone!,
    },
  };
}

export type PreferencesInput = Partial<Record<GarmentCategory, string>>;

/** Free-text fit notes per category. Blank means "remove". */
export function parsePreferencesForm(fd: FormData): Parsed<PreferencesInput> {
  const errors: FieldErrors = {};
  const value: PreferencesInput = {};
  for (const { value: category, label } of GARMENT_CATEGORIES) {
    const note = text(fd, category);
    if (note.length > PREFERENCE_MAX_LENGTH) errors[category] = `Keep ${label.toLowerCase()} notes under ${PREFERENCE_MAX_LENGTH} characters.`;
    else if (note) value[category] = note;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** The submitted strings, so a form that failed validation can be refilled as typed. */
export function echo(fd: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, text(fd, n)]));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
