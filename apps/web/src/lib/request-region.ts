import "server-only";
import { headers } from "next/headers";

const CODE = /^[A-Z0-9]{1,3}$/;

/**
 * The visitor's country and region (e.g. "CA-QC"), from the geolocation headers
 * Vercel adds. Null when they're missing, which they are in local development.
 * Off Vercel these headers can be set by the client, so treat the value as a record
 * of what was claimed, not as proof. Anything that must fail closed (the scan's
 * Illinois block) has to treat null as "unknown".
 */
export async function requestRegion(): Promise<string | null> {
  const h = await headers();
  const country = h.get("x-vercel-ip-country")?.toUpperCase();
  const region = h.get("x-vercel-ip-country-region")?.toUpperCase();
  if (!country || !CODE.test(country)) return null;
  return region && CODE.test(region) ? `${country}-${region}` : country;
}
