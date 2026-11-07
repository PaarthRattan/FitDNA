import { FIT_ZONE_ORDER, type FitZone } from "@/lib/fit-zones";
import { formatCm } from "@/lib/fit/templates";
import type { BodyMeasurements, ChestBasis, GarmentCategory, ReferenceGarment, Stretch } from "@/lib/fit/types";
import type { Database } from "@/lib/supabase/types";
import { CHEST_BASES, GARMENT_CATEGORIES, STRETCH_OPTIONS } from "./fields";

/**
 * Database rows to fit-engine inputs. The generated types widen check-constrained
 * columns to `string`, so values are narrowed here; the database's check
 * constraints mean a mismatch is a bug, and it fails loudly.
 */

export type ReferenceRow = Database["public"]["Tables"]["reference_garments"]["Row"];
export type BodyRow = Pick<Database["public"]["Tables"]["body_measurements"]["Row"], "name" | "value_cm" | "confidence">;

function narrow<T extends string>(value: string, options: ReadonlyArray<{ value: T }>, what: string): T {
  const found = options.find((o) => o.value === value);
  if (!found) throw new Error(`Unexpected ${what} "${value}" from the database`);
  return found.value;
}

export const asCategory = (v: string): GarmentCategory => narrow(v, GARMENT_CATEGORIES, "garment category");
export const asBasis = (v: string): ChestBasis => narrow(v, CHEST_BASES, "chest basis");
export const asStretch = (v: string): Stretch => narrow(v, STRETCH_OPTIONS, "stretch");
export const asZone = (v: string): FitZone =>
  narrow(v, FIT_ZONE_ORDER.map((z) => ({ value: z })), "fit zone");

export function toReferenceGarment(row: ReferenceRow): ReferenceGarment {
  return {
    id: row.id,
    title: row.title,
    category: asCategory(row.category),
    zone: asZone(row.fit_zone),
    measurements: {
      ...(row.chest_cm !== null && { chest: { cm: row.chest_cm, basis: asBasis(row.chest_basis), source: "user" as const } }),
      ...(row.shoulder_cm !== null && { shoulder: { cm: row.shoulder_cm, source: "user" as const } }),
      ...(row.length_cm !== null && { length: { cm: row.length_cm, source: "user" as const } }),
      ...(row.sleeve_cm !== null && { sleeve: { cm: row.sleeve_cm, source: "user" as const } }),
    },
  };
}

export function toBodyMeasurements(rows: readonly BodyRow[]): BodyMeasurements {
  const body: BodyMeasurements = {};
  for (const row of rows) {
    if (row.name === "chest" || row.name === "shoulder" || row.name === "arm") {
      body[row.name] = { cm: row.value_cm, confidence: row.confidence };
    }
  }
  return body;
}

/** Short labels for a reference garment's measurements, e.g. "CHEST 56 CM FLAT". */
export function measurementChips(row: ReferenceRow): string[] {
  const chips: string[] = [];
  if (row.chest_cm !== null) chips.push(`CHEST ${formatCm(row.chest_cm)} CM${row.chest_basis === "flat" ? " FLAT" : ""}`);
  if (row.shoulder_cm !== null) chips.push(`SHOULDER ${formatCm(row.shoulder_cm)} CM`);
  if (row.length_cm !== null) chips.push(`LENGTH ${formatCm(row.length_cm)} CM`);
  if (row.sleeve_cm !== null) chips.push(`SLEEVE ${formatCm(row.sleeve_cm)} CM`);
  if (row.stretch !== "none") chips.push(`${row.stretch.toUpperCase()} STRETCH`);
  return chips;
}

export function categoryLabel(category: string): string {
  return GARMENT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
