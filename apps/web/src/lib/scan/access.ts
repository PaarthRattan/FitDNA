import "server-only";
import { requestRegion } from "@/lib/request-region";
import { scanAllowedForUser, scanEnabled } from "./client";
import { effectiveRegion, scanAllowedInRegion } from "./geo";

/**
 * Whether this user may scan from where they are. Consent is checked separately (and
 * again by the database on every write).
 * - `disabled`: scanning is switched off on this server.
 * - `not_allowed`: on, but only for the developers on SCAN_ALLOWLIST_USER_IDS.
 * - `region`: blocked where they are (Illinois), or we can't tell where that is.
 */
export type ScanAvailability = "ok" | "disabled" | "not_allowed" | "region";

export async function scanAvailability(userId: string): Promise<ScanAvailability> {
  if (!scanEnabled()) return "disabled";
  if (!scanAllowedForUser(userId)) return "not_allowed";
  if (!scanAllowedInRegion(effectiveRegion(await requestRegion()))) return "region";
  return "ok";
}

export const AVAILABILITY_MESSAGES: Record<Exclude<ScanAvailability, "ok">, string> = {
  disabled: "Photo scans aren't switched on yet. You can enter your measurements with a tape measure instead.",
  not_allowed: "Photo scans are only open to a few testers for now. You can enter your measurements with a tape measure instead.",
  region:
    "Photo scans aren't available where you are, or we couldn't tell where that is. They're not offered in Illinois. You can enter your measurements with a tape measure instead.",
};
