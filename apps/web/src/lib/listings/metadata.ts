/**
 * Title, price and images from a scraped page's metadata. Firecrawl returns page
 * meta tags as loosely typed values (a string, or an array when a tag repeats) and
 * doesn't document how product price tags are keyed, so every read is defensive and
 * anything unrecognised is left out.
 */

export interface PageFacts {
  title: string | null;
  price: number | null;
  currency: string | null;
  imageUrls: string[];
}

const TITLE_MAX = 200;
const MAX_IMAGES = 8;
const URL_MAX = 500;

const PRICE_KEYS = ["product:price:amount", "og:price:amount", "productPriceAmount", "ogPriceAmount"];
const CURRENCY_KEYS = ["product:price:currency", "og:price:currency", "productPriceCurrency", "ogPriceCurrency"];

/** " | Grailed", " - eBay" and similar site suffixes on page titles. */
const SITE_SUFFIX = /\s+[|\-–—:]\s+(?:grailed|ebay|poshmark|mercari|depop|vinted)\b.*$/i;
const EBAY_SUFFIX = /\s+\|\s+ebay$/i;

function firstString(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pick(meta: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = firstString(meta[key]);
    if (v) return v;
  }
  return null;
}

export function cleanTitle(raw: string | null): string | null {
  if (!raw) return null;
  const title = raw.replace(EBAY_SUFFIX, "").replace(SITE_SUFFIX, "").replace(/\s+/g, " ").trim();
  return title ? title.slice(0, TITLE_MAX) : null;
}

/** "1,234.50" or "$185" → 1234.5 / 185. Null for anything else. */
export function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/,(?=\d{3}\b)/g, "");
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function httpsUrls(values: unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string" || v.length > URL_MAX) continue;
    try {
      const url = new URL(v);
      if (url.protocol === "https:" && !out.includes(url.href)) out.push(url.href);
    } catch {
      // Not a URL; skip it.
    }
  }
  return out.slice(0, MAX_IMAGES);
}

export function readPageFacts(metadata: Record<string, unknown>, images: unknown): PageFacts {
  const rawCurrency = pick(metadata, CURRENCY_KEYS)?.toUpperCase() ?? null;
  const currency = rawCurrency && /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null;
  const price = parsePrice(pick(metadata, PRICE_KEYS));
  const ogImage = metadata.ogImage ?? metadata["og:image"];
  // A price without a currency can't be shown or compared, so both or neither are kept.
  const priced = price !== null && currency !== null;
  return {
    title: cleanTitle(pick(metadata, ["ogTitle", "og:title", "title"])),
    price: priced ? price : null,
    currency: priced ? currency : null,
    imageUrls: httpsUrls([...(Array.isArray(ogImage) ? ogImage : [ogImage]), ...(Array.isArray(images) ? images : [])]),
  };
}
