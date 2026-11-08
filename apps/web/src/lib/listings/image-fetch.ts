import "server-only";
import { createHash } from "node:crypto";
import { isAllowedImageUrl, sniffImageType, type ImageType } from "./images";
import type { Marketplace } from "./url";

/**
 * Fetches a listing photo into memory, to send to the AI model as base64 (marketplace
 * image URLs are often hotlink-protected or expire, so the model isn't given the URL).
 * Nothing is written to disk, the database or the logs.
 */

export const IMAGE_FETCH_TIMEOUT_MS = 8_000;
export const IMAGE_MAX_BYTES = 6 * 1024 * 1024;

export interface FetchedImage {
  url: string;
  type: ImageType;
  base64: string;
  /** Identifies the image for dedupe, without keeping it. */
  sha256: string;
}

async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return bytes;
}

const MAX_REDIRECTS = 3;

/**
 * Null when the URL isn't allowed, the fetch fails or times out, or it isn't an image
 * within the size cap. Redirects are followed by hand so each hop is checked against
 * the allowlist before it's requested, not after.
 */
export async function fetchListingImage(marketplace: Marketplace, url: string): Promise<FetchedImage | null> {
  const signal = AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS);
  try {
    let current = url;
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedImageUrl(marketplace, current)) return null;
      response = await fetch(current, {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: { Accept: "image/jpeg,image/png,image/webp,image/gif" },
      });
      const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
      if (!location) break;
      current = new URL(location, current).href;
      response = null;
    }
    if (!response?.ok) return null;
    const bytes = await readCapped(response, IMAGE_MAX_BYTES);
    if (!bytes) return null;
    const type = sniffImageType(bytes);
    if (!type) return null;
    const buffer = Buffer.from(bytes);
    return { url, type, base64: buffer.toString("base64"), sha256: createHash("sha256").update(buffer).digest("hex") };
  } catch {
    return null;
  }
}
