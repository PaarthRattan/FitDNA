import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReferenceGarment } from "@/lib/fit/types";
import { apiStatusError, firecrawlEnabled, scrapeListing, siteStatusError } from "./firecrawl";
import {
  effectiveListing,
  formInitial,
  listingBaseline,
  listingFit,
  overrideFromForm,
  readExtraction,
  type OverrideRowLike,
} from "./fit";
import { cleanTitle, parsePrice, readPageFacts } from "./metadata";
import { parseListingForm } from "./parse";
import { parseListingUrl } from "./url";

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

describe("parseListingUrl", () => {
  it.each([
    ["https://www.ebay.com/itm/Wool-Cardigan-Size-M/123456789012?hash=item1c&_trkparms=x", "ebay", "https://www.ebay.com/itm/123456789012"],
    ["https://m.ebay.ca/itm/123456789012", "ebay", "https://www.ebay.ca/itm/123456789012"],
    ["https://www.grailed.com/listings/54321098-margiela-wool-cardigan?utm_source=share", "grailed", "https://www.grailed.com/listings/54321098"],
    ["grailed.com/listings/54321098", "grailed", "https://www.grailed.com/listings/54321098"],
    [
      "https://poshmark.com/listing/Wool-Zip-Cardigan-65f0c1d2e3a4b5c6d7e8f901?referrer=friend",
      "poshmark",
      "https://poshmark.com/listing/Wool-Zip-Cardigan-65f0c1d2e3a4b5c6d7e8f901",
    ],
    ["https://www.mercari.com/us/item/m12345678901/?ref=search", "mercari", "https://www.mercari.com/us/item/m12345678901/"],
    ["https://www.depop.com/products/jane_doe-vintage-wool-cardigan/", "depop", "https://www.depop.com/products/jane_doe-vintage-wool-cardigan/"],
    ["https://www.vinted.co.uk/items/4567890123-wool-cardigan?referrer=catalog", "vinted", "https://www.vinted.co.uk/items/4567890123"],
  ])("%s", (input, marketplace, canonicalUrl) => {
    expect(parseListingUrl(input)).toEqual({ ok: true, marketplace, canonicalUrl });
  });

  it("refuses other sites, including look-alike domains", () => {
    for (const url of ["https://example.com/itm/123456789012", "https://ebay.com.evil.test/itm/123456789012", "https://notgrailed.com/listings/123"]) {
      expect(parseListingUrl(url)).toMatchObject({ ok: false, message: expect.stringContaining("can import listings from") });
    }
  });

  it("refuses search and profile pages on supported sites", () => {
    for (const url of [
      "https://www.ebay.com/sch/i.html?_nkw=cardigan",
      "https://www.grailed.com/shop?query=cardigan",
      "https://www.depop.com/jane_doe/",
      "https://www.vinted.com/catalog?search_text=cardigan",
    ]) {
      expect(parseListingUrl(url)).toMatchObject({ ok: false, message: expect.stringContaining("not a single listing") });
    }
  });

  it("refuses odd links", () => {
    expect(parseListingUrl("")).toMatchObject({ ok: false });
    expect(parseListingUrl("not a url at all")).toMatchObject({ ok: false });
    expect(parseListingUrl("ftp://www.grailed.com/listings/123")).toMatchObject({ ok: false });
    expect(parseListingUrl("https://user:pw@www.grailed.com/listings/123")).toMatchObject({ ok: false });
    expect(parseListingUrl("https://www.grailed.com:8443/listings/123")).toMatchObject({ ok: false });
    expect(parseListingUrl(`https://www.grailed.com/listings/123?x=${"a".repeat(2100)}`)).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

describe("readPageFacts", () => {
  it("reads title, price and images", () => {
    const facts = readPageFacts(
      {
        ogTitle: "Margiela Wool Zip Cardigan | Grailed",
        "product:price:amount": "185.00",
        "product:price:currency": "usd",
        ogImage: "https://media.test/a.jpg",
      },
      ["https://media.test/a.jpg", "https://media.test/b.jpg", "http://insecure.test/c.jpg", "not a url"],
    );
    expect(facts).toEqual({
      title: "Margiela Wool Zip Cardigan",
      price: 185,
      currency: "USD",
      imageUrls: ["https://media.test/a.jpg", "https://media.test/b.jpg"],
    });
  });

  it("drops a price that has no currency", () => {
    expect(readPageFacts({ "og:price:amount": "40" }, [])).toMatchObject({ price: null, currency: null });
  });

  it("copes with arrays, missing values and junk", () => {
    expect(readPageFacts({ title: ["Wool tee - eBay", "x"], ogImage: 42 }, "nope")).toEqual({
      title: "Wool tee",
      price: null,
      currency: null,
      imageUrls: [],
    });
  });

  it("parses prices and cleans titles", () => {
    expect(parsePrice("$1,234.50")).toBe(1234.5);
    expect(parsePrice("185,00")).toBe(185);
    expect(parsePrice("free")).toBeNull();
    expect(cleanTitle("Vintage tee | eBay")).toBe("Vintage tee");
    expect(cleanTitle("  ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Firecrawl client (no network: fetch is stubbed)
// ---------------------------------------------------------------------------

describe("firecrawl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is off unless enabled with a key", async () => {
    vi.stubEnv("FIRECRAWL_ENABLED", "true");
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(firecrawlEnabled()).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await scrapeListing("https://www.grailed.com/listings/1")).toEqual({ ok: false, error: "disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps the site's and Firecrawl's statuses", () => {
    expect(siteStatusError(200)).toBeNull();
    expect(siteStatusError(304)).toBeNull();
    expect(siteStatusError(undefined)).toBeNull();
    expect(siteStatusError(404)).toBe("not_found");
    expect(siteStatusError(403)).toBe("blocked");
    expect(apiStatusError(408)).toBe("timeout");
    expect(apiStatusError(429)).toBe("busy");
    expect(apiStatusError(402)).toBe("failed");
  });

  it("sends only the URL and returns markdown on success", async () => {
    vi.stubEnv("FIRECRAWL_ENABLED", "true");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    const fetchSpy = vi.fn(async () =>
      Response.json({ success: true, data: { markdown: "Pit to pit 22 in", images: [], metadata: { statusCode: 200 } } }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const result = await scrapeListing("https://www.grailed.com/listings/1");
    expect(result).toMatchObject({ ok: true, markdown: "Pit to pit 22 in" });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ url: "https://www.grailed.com/listings/1", formats: ["markdown", "images"] });
  });

  it("reports a page the site blocked", async () => {
    vi.stubEnv("FIRECRAWL_ENABLED", "true");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    vi.stubGlobal("fetch", async () => Response.json({ success: true, data: { markdown: "", metadata: { statusCode: 403 } } }));
    expect(await scrapeListing("https://www.grailed.com/listings/1")).toEqual({ ok: false, error: "blocked" });
  });

  it("reports Firecrawl rate limits as busy", async () => {
    vi.stubEnv("FIRECRAWL_ENABLED", "true");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    vi.stubGlobal("fetch", async () => Response.json({ success: false, error: "Rate limit exceeded" }, { status: 429 }));
    expect(await scrapeListing("https://www.grailed.com/listings/1")).toEqual({ ok: false, error: "busy" });
  });
});

// ---------------------------------------------------------------------------
// Merging extractions and the user's corrections
// ---------------------------------------------------------------------------

const LISTING = { title: "Wool zip cardigan", size_label: "M", condition: "excellent", seller_rating: 4.8 };

const SELLER = {
  source: "seller",
  fields: {
    measurements: {
      chest: { cm: 56, basis: "flat", unit: "in", span: 'Pit to pit 22"', assumed: [] },
      length: { cm: 68, unit: "cm", span: "Length 68 cm", assumed: ["unit"] },
    },
    category: "knit",
  },
};

const noOverride: OverrideRowLike | null = null;

function override(patch: Partial<OverrideRowLike>): OverrideRowLike {
  return {
    title: null,
    category: null,
    size_label: null,
    stretch: null,
    chest_cm: null,
    chest_basis: null,
    shoulder_cm: null,
    length_cm: null,
    sleeve_cm: null,
    cleared: [],
    ...patch,
  };
}

const ZIP_UP: ReferenceGarment = {
  id: "ref-1",
  title: "grey zip-up",
  category: "knit",
  zone: "ideal",
  measurements: {
    chest: { cm: 56, basis: "flat", source: "user" },
    length: { cm: 68, source: "user" },
  },
};

describe("readExtraction", () => {
  it("rejects malformed stored JSON instead of trusting it", () => {
    expect(readExtraction({ source: "nope", fields: {} })).toBeNull();
    expect(readExtraction({ source: "seller", fields: "x" })).toBeNull();
    const e = readExtraction({
      source: "seller",
      fields: {
        measurements: {
          chest: { cm: 56 }, // no basis
          length: { cm: 9999 }, // implausible
          sleeve: { cm: "63" }, // not a number
          shoulder: { cm: 46, span: "Shoulder 46", assumed: ["unit", "bogus"] },
        },
        category: "trousers",
      },
    });
    expect(e).toEqual({
      source: "seller",
      measurements: { shoulder: { cm: 46, unit: "cm", span: "Shoulder 46", assumed: ["unit"] } },
      category: null,
    });
  });
});

describe("effectiveListing", () => {
  it("uses the seller's measurements and the guessed category", () => {
    const e = effectiveListing(LISTING, [SELLER], noOverride);
    expect(e.category).toBe("knit");
    expect(e.measurements).toEqual({
      chest: { cm: 56, basis: "flat", source: "seller" },
      length: { cm: 68, source: "seller" },
    });
    expect(e.details.chest).toEqual({ source: "seller", span: 'Pit to pit 22"', assumed: [] });
    expect(e.estimated).toBe(false);
  });

  it("puts the user's corrections first and drops what they cleared", () => {
    const e = effectiveListing(
      LISTING,
      [SELLER],
      override({ category: "jacket", chest_cm: 58, chest_basis: "flat", cleared: ["length"], stretch: "low" }),
    );
    expect(e.category).toBe("jacket");
    expect(e.stretch).toBe("low");
    expect(e.measurements).toEqual({ chest: { cm: 58, basis: "flat", source: "user" } });
    expect(e.details.chest?.source).toBe("user");
  });

  it("falls back to typical measurements for the size when there are none", () => {
    const e = effectiveListing(LISTING, [{ source: "seller", fields: { measurements: {}, category: "knit" } }], noOverride);
    expect(e.estimated).toBe(true);
    expect(e.measurements.chest?.source).toBe("estimated");
  });

  it("flags a listing that looks out of scope until the user picks a category", () => {
    const pants = { source: "seller", fields: { measurements: {}, category: "out_of_scope" } };
    expect(effectiveListing(LISTING, [pants], noOverride)).toMatchObject({ outOfScope: true, category: null });
    expect(effectiveListing(LISTING, [pants], override({ category: "shirt" }))).toMatchObject({
      outOfScope: false,
      category: "shirt",
    });
  });

  it("prefers seller numbers over AI ones", () => {
    const ai = {
      source: "ai_text",
      fields: { measurements: { chest: { cm: 60, basis: "flat" }, shoulder: { cm: 46 } }, category: "knit" },
    };
    const { measurements } = listingBaseline([ai, SELLER]);
    expect(measurements.chest).toEqual({ cm: 56, basis: "flat", source: "seller" });
    expect(measurements.shoulder).toEqual({ cm: 46, source: "ai_text" });
  });
});

describe("listingFit", () => {
  const context = { body: {}, references: [ZIP_UP] };

  it("predicts against the user's reference garment and scores it", () => {
    const fit = listingFit(effectiveListing(LISTING, [SELLER], noOverride), LISTING.seller_rating, context);
    expect(fit.gap).toBeNull();
    expect(fit.prediction?.overall).toBe("ideal");
    expect(fit.prediction?.parts.chest.anchor).toMatchObject({ kind: "reference", referenceTitle: "grey zip-up" });
    expect(fit.score?.score).toBeGreaterThan(0);
    // No price history yet: the price component is reported as missing, not invented.
    expect(fit.score?.components.find((c) => c.key === "price")?.value).toBeNull();
  });

  it("says what's missing when it can't predict", () => {
    const bare = { ...LISTING, size_label: null };
    expect(listingFit(effectiveListing(bare, [], noOverride), null, context).gap).toBe("category");
    expect(listingFit(effectiveListing(bare, [], override({ category: "knit" })), null, context).gap).toBe("measurements");
    expect(listingFit(effectiveListing(LISTING, [SELLER], noOverride), null, { body: {}, references: [] }).gap).toBe("passport");
  });
});

describe("overrideFromForm", () => {
  const baseline = effectiveListing(LISTING, [SELLER], noOverride).measurements;
  const input = {
    title: null,
    category: "knit" as const,
    sizeLabel: "M",
    stretch: "none" as const,
    chestCm: 56,
    chestBasis: "flat" as const,
    shoulderCm: null,
    lengthCm: 68,
    sleeveCm: null,
  };

  it("stores nothing for numbers confirmed as the listing gave them", () => {
    expect(overrideFromForm(input, baseline, LISTING)).toMatchObject({
      chest_cm: null,
      chest_basis: null,
      length_cm: null,
      size_label: null,
      cleared: [],
    });
  });

  it("treats the same chest written the other way (all the way around) as unchanged", () => {
    expect(overrideFromForm({ ...input, chestCm: 112, chestBasis: "circumference" }, baseline, LISTING).chest_cm).toBeNull();
  });

  it("stores changed and new numbers, and records emptied ones as cleared", () => {
    const row = overrideFromForm({ ...input, chestCm: 58, lengthCm: null, sleeveCm: 63, title: "my cardigan" }, baseline, LISTING);
    expect(row).toMatchObject({ chest_cm: 58, chest_basis: "flat", sleeve_cm: 63, length_cm: null, cleared: ["length"], title: "my cardigan" });
  });

  it("round-trips with formInitial", () => {
    const e = effectiveListing(LISTING, [SELLER], override({ category: "knit", sleeve_cm: 63 }));
    expect(formInitial(e, null)).toMatchObject({ category: "knit", chest: "56", chestBasis: "flat", length: "68", sleeve: "63" });
  });

  it("doesn't prefill estimated values", () => {
    const e = effectiveListing(LISTING, [], override({ category: "knit" }));
    expect(e.estimated).toBe(true);
    expect(formInitial(e, null)).toMatchObject({ chest: "", shoulder: "", length: "", sleeve: "" });
  });
});

describe("parseListingForm", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };

  it("needs a category, and nothing else", () => {
    expect(parseListingForm(form({}))).toMatchObject({ ok: false, errors: { category: expect.any(String) } });
    expect(parseListingForm(form({ category: "tee" }))).toMatchObject({
      ok: true,
      value: { category: "tee", chestCm: null, stretch: "none", chestBasis: "flat" },
    });
  });

  it("converts inches and checks ranges", () => {
    expect(parseListingForm(form({ category: "tee", unit: "in", chest: "22" }))).toMatchObject({ ok: true, value: { chestCm: 55.9 } });
    expect(parseListingForm(form({ category: "tee", chest: "300" }))).toMatchObject({ ok: false, errors: { chest: expect.any(String) } });
  });
});
