/**
 * Where photo scans may be offered, from the visitor's region (`requestRegion()`,
 * e.g. "CA-QC" or "US-IL", null when unknown).
 *
 * Illinois is blocked: its Biometric Information Privacy Act needs written consent and
 * a published retention policy we don't have yet. The check fails closed: an unknown
 * region, or a US visitor whose state is unknown, could be in Illinois, so they're
 * blocked too. In local development there are no region headers, so `SCAN_DEV_REGION`
 * can stand in for them, and only outside production.
 */

const BLOCKED = new Set(["US-IL"]);

export function scanAllowedInRegion(region: string | null): boolean {
  if (!region) return false;
  if (BLOCKED.has(region)) return false;
  if (region === "US") return false;
  return true;
}

/** The region to judge: the request's, or in development only, `SCAN_DEV_REGION`. */
export function effectiveRegion(
  requestRegion: string | null,
  env: { NODE_ENV?: string; SCAN_DEV_REGION?: string } = process.env,
): string | null {
  if (requestRegion) return requestRegion;
  if (env.NODE_ENV !== "development") return null;
  const dev = env.SCAN_DEV_REGION?.trim().toUpperCase();
  return dev && /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(dev) ? dev : null;
}
