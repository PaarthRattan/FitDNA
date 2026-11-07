import { BODY_FIELDS } from "./fields";

/** How many distinct reference categories count towards a complete passport. */
export const REFERENCE_CATEGORIES_GOAL = 3;

export interface PassportStep {
  key: string;
  label: string;
  why: string;
  href: string;
  done: boolean;
}

export interface PassportStatus {
  pct: number;
  steps: PassportStep[];
  /** The first step not done yet, or null when the passport is complete. */
  next: PassportStep | null;
}

/**
 * Passport completeness: each body measurement the engine uses, plus a reference
 * garment in up to three different categories. Every step counts equally.
 */
export function passportStatus(measured: readonly string[], referenceCategories: readonly string[]): PassportStatus {
  const categories = new Set(referenceCategories).size;
  const steps: PassportStep[] = [
    ...BODY_FIELDS.map((f) => ({
      key: f.name,
      label: `Measure your ${f.label.toLowerCase()}`,
      why: "Without it, listings with no matching reference garment can't be compared to your body.",
      href: "/passport/measure",
      done: measured.includes(f.name),
    })),
    ...Array.from({ length: REFERENCE_CATEGORIES_GOAL }, (_, i) => ({
      key: `reference-${i + 1}`,
      label: i === 0 ? "Add a reference garment" : "Add a reference garment from another category",
      why: "Each category is compared against a piece you own. Without one, predictions fall back to typical fit.",
      href: "/passport/garments/new",
      done: categories > i,
    })),
  ];
  const done = steps.filter((s) => s.done).length;
  return {
    pct: Math.round((done / steps.length) * 100),
    steps,
    next: steps.find((s) => !s.done) ?? null,
  };
}
