import { sniffImageType } from "@/lib/listings/images";
import { text, type FieldErrors, type Parsed } from "@/lib/passport/parse";
import {
  SCAN_AGE_MAX,
  SCAN_AGE_MIN,
  SCAN_HEIGHT_MAX_CM,
  SCAN_HEIGHT_MIN_CM,
  SCAN_MAX_IMAGE_BYTES,
  SCAN_WEIGHT_MAX_KG,
  SCAN_WEIGHT_MIN_KG,
} from "./constants";

/**
 * Parses the scan upload (the browser's multipart POST to /api/scan). Everything in it
 * is untrusted: photo types are read from their bytes, sizes and ranges are checked,
 * and the result is in cm and kg. Weight, age and sex are optional; they only sharpen
 * the estimate, and they're never stored.
 */

export type Sex = "male" | "female";

export interface ScanPhoto {
  bytes: Uint8Array<ArrayBuffer>;
  type: "image/jpeg" | "image/png" | "image/webp";
}

export interface ScanUpload {
  front: ScanPhoto;
  side: ScanPhoto;
  heightCm: number;
  weightKg: number | null;
  age: number | null;
  sex: Sex | null;
}

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

/** "178", "178.5" or "178,5"; null when blank, NaN when not a positive number. */
function decimal(fd: FormData, name: string): number | null {
  const raw = text(fd, name).replace(",", ".");
  if (raw === "") return null;
  return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

async function photo(fd: FormData, name: "front" | "side", label: string, errors: FieldErrors): Promise<ScanPhoto | null> {
  const file = fd.get(name);
  if (!(file instanceof Blob) || file.size === 0) {
    errors[name] = `Add the ${label} photo.`;
    return null;
  }
  if (file.size > SCAN_MAX_IMAGE_BYTES) {
    errors[name] = `The ${label} photo is too large. Take it again; the page shrinks photos before sending.`;
    return null;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") {
    errors[name] = `The ${label} photo needs to be a JPEG, PNG or WebP image.`;
    return null;
  }
  return { bytes, type };
}

export async function parseScanUpload(fd: FormData): Promise<Parsed<ScanUpload>> {
  const errors: FieldErrors = {};
  const unit = text(fd, "unit") || "cm";
  if (unit !== "cm" && unit !== "in") errors.unit = "Choose centimetres or inches.";
  const imperial = unit === "in";

  if (text(fd, "adult") !== "yes") errors.adult = "Scans are for adults only. Tick the box to confirm you're 18 or older.";

  let heightCm: number | null = null;
  const height = decimal(fd, "height");
  if (height === null) errors.height = "Enter your height. The scan needs it to get the scale right.";
  else if (Number.isNaN(height)) errors.height = "Height should be a number, like 178 or 70.";
  else {
    heightCm = round1(imperial ? height * CM_PER_INCH : height);
    if (heightCm < SCAN_HEIGHT_MIN_CM || heightCm > SCAN_HEIGHT_MAX_CM) {
      errors.height = `Height should be between ${SCAN_HEIGHT_MIN_CM} and ${SCAN_HEIGHT_MAX_CM} cm (${Math.round(SCAN_HEIGHT_MIN_CM / CM_PER_INCH)}–${Math.round(SCAN_HEIGHT_MAX_CM / CM_PER_INCH)} in).`;
      heightCm = null;
    }
  }

  let weightKg: number | null = null;
  const weight = decimal(fd, "weight");
  if (weight !== null) {
    const kg = Number.isNaN(weight) ? NaN : round1(imperial ? weight * KG_PER_LB : weight);
    if (!(kg >= SCAN_WEIGHT_MIN_KG && kg <= SCAN_WEIGHT_MAX_KG)) {
      errors.weight = `Weight should be between ${SCAN_WEIGHT_MIN_KG} and ${SCAN_WEIGHT_MAX_KG} kg (${Math.round(SCAN_WEIGHT_MIN_KG / KG_PER_LB)}–${Math.round(SCAN_WEIGHT_MAX_KG / KG_PER_LB)} lb), or left blank.`;
    } else weightKg = kg;
  }

  let age: number | null = null;
  const rawAge = text(fd, "age");
  if (rawAge !== "") {
    const n = /^\d{1,3}$/.test(rawAge) ? Number(rawAge) : NaN;
    if (!(n >= SCAN_AGE_MIN && n <= SCAN_AGE_MAX)) errors.age = `Age should be a whole number from ${SCAN_AGE_MIN} to ${SCAN_AGE_MAX}, or left blank.`;
    else age = n;
  }

  const rawSex = text(fd, "sex");
  const sex: Sex | null = rawSex === "male" || rawSex === "female" ? rawSex : null;
  if (rawSex !== "" && sex === null) errors.sex = "Choose one of the options, or leave it blank.";

  const front = await photo(fd, "front", "front", errors);
  const side = await photo(fd, "side", "side", errors);

  if (Object.keys(errors).length || !front || !side || heightCm === null) return { ok: false, errors };
  return { ok: true, value: { front, side, heightCm, weightKg, age, sex } };
}
