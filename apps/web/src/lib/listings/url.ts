/**
 * Which pasted links FitDNA accepts, and the canonical form each is stored under.
 *
 * Only single listing pages on six resale marketplaces are accepted. Search and
 * category pages are refused on purpose: fetching one page a user pasted is
 * defensible under these sites' terms, systematically crawling their search
 * results is not. The canonical URL drops tracking and share parameters, so the
 * same listing pasted twice is fetched once, and so nothing identifying the person
 * who shared the link is kept.
 */

export type Marketplace = "ebay" | "grailed" | "poshmark" | "mercari" | "depop" | "vinted";

interface MarketplaceRule {
  label: string;
  /** Registrable domains, without "www." or "m.". */
  domains: readonly string[];
  /** Matches the path of a single listing. */
  listing: RegExp;
  canonical: (domain: string, match: RegExpMatchArray) => string;
}

export const MARKETPLACES: Record<Marketplace, MarketplaceRule> = {
  ebay: {
    label: "eBay",
    domains: ["ebay.com", "ebay.ca", "ebay.co.uk", "ebay.com.au", "ebay.ie", "ebay.de", "ebay.fr", "ebay.it", "ebay.es"],
    listing: /^\/itm\/(?:[^/]+\/)?(\d{9,15})\/?$/,
    canonical: (domain, m) => `https://www.${domain}/itm/${m[1]}`,
  },
  grailed: {
    label: "Grailed",
    domains: ["grailed.com"],
    listing: /^\/listings\/(\d{3,12})(?:-[^/]*)?\/?$/,
    canonical: (_domain, m) => `https://www.grailed.com/listings/${m[1]}`,
  },
  poshmark: {
    label: "Poshmark",
    domains: ["poshmark.com", "poshmark.ca"],
    // The listing id is the trailing 24 hex characters; the slug before it is kept
    // because the site may not resolve a bare id.
    listing: /^\/listing\/((?:[A-Za-z0-9]+-)*[0-9a-f]{24})\/?$/,
    canonical: (domain, m) => `https://${domain}/listing/${m[1]}`,
  },
  mercari: {
    label: "Mercari",
    domains: ["mercari.com"],
    listing: /^\/(?:us\/)?item\/(m\d{6,15})\/?$/,
    canonical: (_domain, m) => `https://www.mercari.com/us/item/${m[1]}/`,
  },
  depop: {
    label: "Depop",
    domains: ["depop.com"],
    // "<seller>-<item words>"; seller names can contain "_" and ".".
    listing: /^\/products\/([a-z0-9_.]+(?:-[a-z0-9_.]+)+)\/?$/,
    canonical: (_domain, m) => `https://www.depop.com/products/${m[1]}/`,
  },
  vinted: {
    label: "Vinted",
    domains: ["vinted.com", "vinted.ca", "vinted.co.uk", "vinted.fr", "vinted.de", "vinted.it", "vinted.es", "vinted.nl", "vinted.be"],
    listing: /^\/items\/(\d{3,15})(?:-[^/]*)?\/?$/,
    canonical: (domain, m) => `https://www.${domain}/items/${m[1]}`,
  },
};

export const MARKETPLACE_ORDER: Marketplace[] = ["ebay", "grailed", "poshmark", "mercari", "depop", "vinted"];

export function marketplaceLabel(marketplace: string): string {
  return MARKETPLACES[marketplace as Marketplace]?.label ?? marketplace;
}

export const SUPPORTED_SITES = "eBay, Grailed, Poshmark, Mercari, Depop and Vinted";

export type ParsedListingUrl =
  | { ok: true; marketplace: Marketplace; canonicalUrl: string }
  | { ok: false; message: string };

const MAX_URL_LENGTH = 2000;

function fail(message: string): ParsedListingUrl {
  return { ok: false, message };
}

/** Accepts a pasted listing link, with or without "https://", and returns its canonical form. */
export function parseListingUrl(input: string): ParsedListingUrl {
  const raw = input.trim();
  if (!raw) return fail("Paste a link to a listing.");
  if (raw.length > MAX_URL_LENGTH) return fail("That link is too long to be a listing.");

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return fail("That doesn't look like a link. Copy it from your browser's address bar.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return fail("Paste a web link, starting with https://.");
  if (url.username || url.password || url.port) return fail("That doesn't look like a normal listing link.");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const domain = host.replace(/^(?:www|m)\./, "");
  const marketplace = MARKETPLACE_ORDER.find((m) => MARKETPLACES[m].domains.includes(domain));
  if (!marketplace) return fail(`FitDNA can import listings from ${SUPPORTED_SITES}.`);

  const rule = MARKETPLACES[marketplace];
  const match = url.pathname.match(rule.listing);
  if (!match) {
    return fail(`That's a ${rule.label} page, but not a single listing. Open the listing itself and copy its link.`);
  }
  return { ok: true, marketplace, canonicalUrl: rule.canonical(domain, match) };
}
