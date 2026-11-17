import { BODY_FIELDS, type BodyFieldName } from "@/lib/passport/fields";
import { AVATAR_MAX_BYTES, SCAN_MAX_CONFIDENCE, SCAN_MIN_RANGE_CM } from "./constants";

/**
 * Validates the scan service's reply (services/scan/app/schema.py `ScanResult`) before
 * anything is stored. The service is ours, but its reply is still checked like any
 * outside input: every number must be finite and plausible, and confidence is capped
 * here, so the web app, not the service, decides how far a scan is trusted.
 *
 * Only the fields the fit engine uses are kept (`BODY_FIELDS`). The service also
 * estimates waist and hip; they're dropped (data minimisation).
 */

export const SCAN_FLAGS = ["loose_clothing", "views_disagree", "unvalidated"] as const;
export type ScanFlag = (typeof SCAN_FLAGS)[number];

export interface ScannedMeasurement {
  value_cm: number;
  range_cm: number;
  confidence: number;
  disagreement_cm: number | null;
  flags: ScanFlag[];
}

/** What `scans.result` holds. */
export interface StoredScanResult {
  measurements: Partial<Record<BodyFieldName, ScannedMeasurement>>;
  flags: ScanFlag[];
}

export interface BodyShape {
  layout: string;
  coeffs: number[];
  scales: Record<string, number>;
}

export interface ScanResult {
  pipelineVersion: string;
  stored: StoredScanResult;
  shape: BodyShape;
  glb: Uint8Array<ArrayBuffer>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round1 = (n: number) => Math.round(n * 10) / 10;

function flags(v: unknown): ScanFlag[] {
  return Array.isArray(v) ? SCAN_FLAGS.filter((f) => v.includes(f)) : [];
}

function measurement(name: BodyFieldName, v: unknown): ScannedMeasurement | null {
  if (!isObject(v) || !finite(v.value_cm) || !finite(v.range_cm) || !finite(v.confidence)) return null;
  const field = BODY_FIELDS.find((f) => f.name === name)!;
  if (v.value_cm < field.min || v.value_cm > field.max) return null;
  if (v.range_cm < 0 || v.range_cm >= 50 || v.confidence < 0 || v.confidence > 100) return null;
  const disagreement = finite(v.disagreement_cm) && v.disagreement_cm >= 0 && v.disagreement_cm < 50 ? round1(v.disagreement_cm) : null;
  return {
    value_cm: round1(v.value_cm),
    range_cm: round1(Math.max(v.range_cm, SCAN_MIN_RANGE_CM[name])),
    confidence: Math.round(Math.min(v.confidence, SCAN_MAX_CONFIDENCE[name])),
    disagreement_cm: disagreement,
    flags: flags(v.flags),
  };
}

function shape(v: unknown): BodyShape | null {
  if (!isObject(v) || typeof v.layout !== "string" || v.layout.length < 1 || v.layout.length > 60) return null;
  const { coeffs, scales } = v;
  if (!Array.isArray(coeffs) || coeffs.length !== 20 || !coeffs.every((c) => finite(c) && Math.abs(c) <= 10)) return null;
  if (!isObject(scales)) return null;
  const entries = Object.entries(scales);
  if (entries.length > 40) return null;
  if (!entries.every(([k, s]) => /^[a-z0-9_]{1,40}$/.test(k) && finite(s) && Math.abs(s) <= 1)) return null;
  return { layout: v.layout, coeffs: coeffs as number[], scales: Object.fromEntries(entries) as Record<string, number> };
}

/** The GLB file, or null unless it's a binary glTF (magic "glTF", version 2) of a sensible size. */
export function decodeGlb(base64: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof base64 !== "string" || base64.length === 0 || base64.length > Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 4) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.length < 20 || bytes.length > AVATAR_MAX_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) return null;
  if (view.getUint32(8, true) !== bytes.length) return null;
  return bytes;
}

export function validateScanResult(json: unknown): ScanResult | null {
  if (!isObject(json) || !isObject(json.measurements)) return null;
  if (typeof json.pipeline_version !== "string" || json.pipeline_version.length < 1 || json.pipeline_version.length > 200) return null;

  const measurements: StoredScanResult["measurements"] = {};
  for (const { name } of BODY_FIELDS) {
    const m = measurement(name, json.measurements[name]);
    if (m) measurements[name] = m;
  }
  if (Object.keys(measurements).length === 0) return null;

  const body = shape(json.body_shape);
  const glb = decodeGlb(json.glb_base64);
  if (!body || !glb) return null;

  return {
    pipelineVersion: json.pipeline_version,
    stored: { measurements, flags: flags(json.flags) },
    shape: body,
    glb,
  };
}

/** Reads `scans.result` back. Rows are ours, but the shape is re-checked rather than cast. */
export function readStoredResult(json: unknown): StoredScanResult | null {
  if (!isObject(json) || !isObject(json.measurements)) return null;
  const measurements: StoredScanResult["measurements"] = {};
  for (const { name } of BODY_FIELDS) {
    const m = measurement(name, json.measurements[name]);
    if (m) measurements[name] = m;
  }
  return { measurements, flags: flags(json.flags) };
}
