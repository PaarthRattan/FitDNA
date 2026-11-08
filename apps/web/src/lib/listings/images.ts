import type { Marketplace } from "./url";

/**
 * Which of a page's images are the listing's own photos, and whether a URL may be
 * fetched at all. Pure, so it's unit-tested; the fetching is in image-fetch.ts.
 *
 * Image URLs come from scraped pages, so they're untrusted: the server only ever
 * fetches https URLs on the marketplace's own image hosts (an allowlist, never a
 * blocklist), which rules out requests to internal addresses.
 */

/** Each marketplace's image hosts. Matched against the whole hostname. */
export const IMAGE_HOSTS: Record<Marketplace, RegExp> = {
  ebay: /^(?:[a-z0-9-]+\.)*ebayimg\.com$/,
  grailed: /^(?:[a-z0-9-]+\.)*grailed\.com$/,
  poshmark: /^(?:di2ponv0v5otw\.cloudfront\.net|(?:[a-z0-9-]+\.)*poshmark\.(?:com|ca))$/,
  mercari: /^(?:[a-z0-9-]+\.)*(?:mercdn\.net|mercari\.com)$/,
  depop: /^(?:[a-z0-9-]+\.)*depop\.com$/,
  vinted: /^(?:[a-z0-9-]+\.)*vinted\.net$/,
};

/** Site furniture rather than photos of the item. */
const NOT_A_PHOTO = /avatar|icon|logo|badge|sprite|placeholder|emoji|flag|banner|\.svg(?:$|\?)/i;

/** The listing id inside its canonical URL, where the site also puts it in photo URLs. */
function listingToken(marketplace: Marketplace, canonicalUrl: string): string | null {
  if (marketplace === "mercari") return canonicalUrl.match(/\/item\/(m\d+)/)?.[1] ?? null;
  if (marketplace === "poshmark") return canonicalUrl.match(/([0-9a-f]{24})\/?$/)?.[1] ?? null;
  return null;
}

export function isAllowedImageUrl(marketplace: Marketplace, raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && IMAGE_HOSTS[marketplace].test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The listing's photos from everything on its page, in page order (the main photo
 * first): on the site's image hosts, not site furniture, one per image path. When
 * the site puts the listing's id in its photo URLs, only those count, which leaves
 * out "similar items".
 */
export function pickListingImages(marketplace: Marketplace, canonicalUrl: string, urls: readonly string[], max: number): string[] {
  const candidates = urls.filter((u) => isAllowedImageUrl(marketplace, u) && !NOT_A_PHOTO.test(u));
  const token = listingToken(marketplace, canonicalUrl);
  const own = token ? candidates.filter((u) => u.includes(token)) : [];
  const chosen = own.length > 0 ? own : candidates;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of chosen) {
    const { origin, pathname } = new URL(u);
    if (seen.has(origin + pathname)) continue;
    seen.add(origin + pathname);
    out.push(u);
    if (out.length === max) break;
  }
  return out;
}

export type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** The image's real type from its first bytes; null for anything that isn't one of these. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}
