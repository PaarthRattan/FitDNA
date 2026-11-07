import type { GarmentCategory, GarmentMeasurements } from "./types";

/**
 * Typical measurements by size label, for when a listing gives only a size. Rough
 * by design: everything here is marked `estimated`, the lowest-trust source, so it
 * lowers confidence rather than pretending to be a real measurement.
 * Values in cm: chest circumference, shoulder, body length, sleeve.
 */
const TABLE: Record<GarmentCategory, Record<string, [number, number, number, number]>> = {
  tee: {
    XS: [90, 42, 68, 19],
    S: [96, 44, 70, 20],
    M: [102, 46, 72, 21],
    L: [108, 48, 74, 22],
    XL: [116, 50, 76, 23],
    XXL: [124, 52, 78, 24],
  },
  shirt: {
    XS: [98, 42, 74, 62],
    S: [104, 44, 76, 63],
    M: [110, 46, 78, 64],
    L: [116, 48, 80, 65],
    XL: [124, 50, 82, 66],
    XXL: [132, 52, 84, 67],
  },
  knit: {
    XS: [94, 42, 64, 61],
    S: [100, 44, 66, 62],
    M: [106, 46, 68, 63],
    L: [112, 48, 70, 64],
    XL: [120, 50, 72, 65],
    XXL: [128, 52, 74, 66],
  },
  jacket: {
    XS: [102, 43, 66, 62],
    S: [108, 45, 68, 63],
    M: [114, 47, 70, 64],
    L: [120, 49, 72, 65],
    XL: [128, 51, 74, 66],
    XXL: [136, 53, 76, 67],
  },
};

const ALIASES: Record<string, string> = {
  "EXTRA SMALL": "XS",
  SMALL: "S",
  MEDIUM: "M",
  LARGE: "L",
  "EXTRA LARGE": "XL",
  "2XL": "XXL",
};

/** Estimated measurements for a size label, or undefined when the label isn't a standard letter size. */
export function genericMeasurements(category: GarmentCategory, sizeLabel: string): GarmentMeasurements | undefined {
  const key = sizeLabel.trim().toUpperCase();
  const row = TABLE[category][ALIASES[key] ?? key];
  if (!row) return undefined;
  const [chest, shoulder, length, sleeve] = row;
  return {
    chest: { cm: chest, basis: "circumference", source: "estimated" },
    shoulder: { cm: shoulder, source: "estimated" },
    length: { cm: length, source: "estimated" },
    sleeve: { cm: sleeve, source: "estimated" },
  };
}
