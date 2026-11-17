import { SCAN_STALE_SECONDS } from "./constants";

/** Why a scan didn't produce measurements. Matches `scans.error_code`. */
export type ScanError =
  | "too_large"
  | "bad_image"
  | "no_person"
  | "multiple_people"
  | "pose_front"
  | "pose_side"
  | "bad_height"
  | "timeout"
  | "busy"
  | "failed";

export const SCAN_ERRORS: readonly ScanError[] = [
  "too_large",
  "bad_image",
  "no_person",
  "multiple_people",
  "pose_front",
  "pose_side",
  "bad_height",
  "timeout",
  "busy",
  "failed",
];

export const isScanError = (value: unknown): value is ScanError => SCAN_ERRORS.includes(value as ScanError);

export type ScanState = { state: "working" } | { state: "done" } | { state: "failed"; error: ScanError };

export interface ScanRow {
  status: string;
  error_code: string | null;
  updated_at: string;
}

/**
 * Where a scan stands. One that has been pending too long was cut off before it could
 * record an outcome, so it counts as timed out rather than being polled forever.
 */
export function scanState(row: ScanRow, now = Date.now()): ScanState {
  if (row.status === "done") return { state: "done" };
  if (row.status === "failed") return { state: "failed", error: isScanError(row.error_code) ? row.error_code : "failed" };
  if (now - Date.parse(row.updated_at) > SCAN_STALE_SECONDS * 1000) return { state: "failed", error: "timeout" };
  return { state: "working" };
}

/** What to tell the user when a scan fails. Every failure leaves the tape measure as the way forward. */
export const SCAN_MESSAGES: Record<ScanError, string> = {
  too_large: "The photos were too large to send. Take them again; the page shrinks them before sending.",
  bad_image: "We couldn't read one of the photos. Take them again as ordinary JPEG or PNG photos.",
  no_person: "We couldn't find a person in one of the photos. Make sure your whole body is in the frame, head to feet.",
  multiple_people: "There's more than one person in a photo. Only you should be in the frame.",
  pose_front:
    "The front photo needs you facing the camera, arms slightly away from your sides (like an A). Take it again.",
  pose_side: "The side photo needs your right side to the camera, standing straight. Take it again.",
  bad_height: "Your height needs to be between 120 and 230 cm.",
  timeout: "The scan took too long and was stopped. Try again in a few minutes, or enter your measurements yourself.",
  busy: "The scanner is busy right now. Try again in a few minutes, or enter your measurements yourself.",
  failed: "Something went wrong with the scan. Try again later, or enter your measurements yourself.",
};
