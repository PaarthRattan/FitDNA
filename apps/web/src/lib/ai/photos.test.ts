import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReferenceGarment } from "@/lib/fit/types";
import { effectiveListing, readStoredChart, sizeRecommendation } from "@/lib/listings/fit";
import { fetchListingImage, IMAGE_MAX_BYTES } from "@/lib/listings/image-fetch";
import { isAllowedImageUrl, pickListingImages, sniffImageType } from "@/lib/listings/images";
import { chartRowMeasurements, validateListingPhotos } from "./tasks/listing-photos";

// ---------------------------------------------------------------------------
// Which images, and which hosts
// ---------------------------------------------------------------------------

describe("isAllowedImageUrl", () => {
  it("allows only https on the marketplace's own image hosts", () => {
    expect(isAllowedImageUrl("ebay", "https://i.ebayimg.com/images/g/abc/s-l1600.jpg")).toBe(true);
    expect(isAllowedImageUrl("grailed", "https://media-assets.grailed.com/prd/listing/1/a.jpg")).toBe(true);
    expect(isAllowedImageUrl("poshmark", "https://di2ponv0v5otw.cloudfront.net/posts/2023/x.jpg")).toBe(true);
    expect(isAllowedImageUrl("mercari", "https://u-mercari-images.mercdn.net/photos/m1_1.jpg")).toBe(true);
    expect(isAllowedImageUrl("depop", "https://media-photos.depop.com/b1/1/2/P0.jpg")).toBe(true);
    expect(isAllowedImageUrl("vinted", "https://images1.vinted.net/t/01.jpeg")).toBe(true);
  });

  it("refuses everything else", () => {
    for (const [m, url] of [
      ["ebay", "http://i.ebayimg.com/a.jpg"],
      ["ebay", "https://i.ebayimg.com.evil.test/a.jpg"],
      ["ebay", "https://notebayimg.com/a.jpg"],
      ["ebay", "https://media-assets.grailed.com/a.jpg"],
      ["grailed", "https://127.0.0.1/a.jpg"],
      ["grailed", "https://169.254.169.254/latest/meta-data"],
      ["grailed", "https://user:pw@media-assets.grailed.com/a.jpg"],
      ["grailed", "https://media-assets.grailed.com:8443/a.jpg"],
      ["poshmark", "https://evil.cloudfront.net/a.jpg"],
      ["depop", "not a url"],
    ] as const) {
      expect(isAllowedImageUrl(m, url), url).toBe(false);
    }
  });
});

describe("pickListingImages", () => {
  it("keeps the listing's photos in page order, without furniture or repeats", () => {
    const urls = [
      "https://media-assets.grailed.com/prd/listing/1/a.jpg?w=800",
      "https://media-assets.grailed.com/prd/avatar/9/me.jpg",
      "https://media-assets.grailed.com/prd/listing/1/a.jpg?w=1600",
      "https://www.grailed.com/logo.svg",
      "https://cdn.other.test/b.jpg",
      "https://media-assets.grailed.com/prd/listing/1/b.jpg",
    ];
    expect(pickListingImages("grailed", "https://www.grailed.com/listings/1", urls, 8)).toEqual([
      "https://media-assets.grailed.com/prd/listing/1/a.jpg?w=800",
      "https://media-assets.grailed.com/prd/listing/1/b.jpg",
    ]);
  });

  it("prefers photos with the listing's id where the site puts it there (Mercari, Poshmark)", () => {
    const urls = [
      "https://u-mercari-images.mercdn.net/thumb/photos/m999_1.jpg",
      "https://u-mercari-images.mercdn.net/photos/m55002285826_1.jpg",
      "https://u-mercari-images.mercdn.net/photos/m55002285826_2.jpg",
    ];
    expect(pickListingImages("mercari", "https://www.mercari.com/us/item/m55002285826/", urls, 8)).toEqual(urls.slice(1));
  });

  it("caps the count", () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://i.ebayimg.com/images/g/${i}/s-l1600.jpg`);
    expect(pickListingImages("ebay", "https://www.ebay.com/itm/123456789", urls, 4)).toHaveLength(4);
  });
});

describe("sniffImageType", () => {
  it("reads the real type from the first bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fetching (fetch is stubbed)
// ---------------------------------------------------------------------------

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe("fetchListingImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches an allowed image into memory", async () => {
    vi.stubGlobal("fetch", async () => new Response(JPEG, { status: 200 }));
    const image = await fetchListingImage("ebay", "https://i.ebayimg.com/a.jpg");
    expect(image).toMatchObject({ type: "image/jpeg", base64: Buffer.from(JPEG).toString("base64") });
    expect(image?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never requests a URL that isn't allowed", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await fetchListingImage("ebay", "https://169.254.169.254/latest/meta-data")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("checks every redirect before following it", async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      url.includes("i.ebayimg.com/a")
        ? new Response(null, { status: 302, headers: { location: "https://i.ebayimg.com/b.jpg" } })
        : url.includes("i.ebayimg.com/b")
          ? new Response(null, { status: 302, headers: { location: "http://10.0.0.1/secret" } })
          : new Response(JPEG),
    );
    vi.stubGlobal("fetch", fetchSpy);
    expect(await fetchListingImage("ebay", "https://i.ebayimg.com/a.jpg")).toBeNull();
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual(["https://i.ebayimg.com/a.jpg", "https://i.ebayimg.com/b.jpg"]);
  });

  it("refuses non-images, errors and oversized files", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>blocked</html>", { status: 200 }));
    expect(await fetchListingImage("ebay", "https://i.ebayimg.com/a.jpg")).toBeNull();
    vi.stubGlobal("fetch", async () => new Response(JPEG, { status: 404 }));
    expect(await fetchListingImage("ebay", "https://i.ebayimg.com/a.jpg")).toBeNull();
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(IMAGE_MAX_BYTES + 1), { status: 200 }));
    expect(await fetchListingImage("ebay", "https://i.ebayimg.com/a.jpg")).toBeNull();
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect(await fetchListingImage("ebay", "https://i.ebayimg.com/a.jpg")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// What's kept from the model's reply
// ---------------------------------------------------------------------------

const photos = (...kinds: string[]) => kinds.map((kind, i) => ({ photo: i + 1, kind }));
const tape = (patch: Record<string, unknown>) => ({
  part: "chest",
  value: 22,
  unit: "in",
  basis: "flat",
  photo: 2,
  evidence: "tape across the chest from armpit to armpit, reading 22 in",
  ...patch,
});
const chart = (patch: Record<string, unknown>) => ({
  photo: 3,
  measures: "garment",
  unit: "cm",
  chest_basis: "flat",
  rows: [
    { label: "S", chest: 50, shoulder: 44, length: 68, sleeve: 61 },
    { label: "M", chest: 53, shoulder: 46, length: 70, sleeve: 62 },
    { label: "L", chest: 56, shoulder: 48, length: 72, sleeve: 63 },
  ],
  ...patch,
});

describe("validateListingPhotos", () => {
  it("keeps tape-measure readings from tape-measure photos", () => {
    const r = validateListingPhotos(
      { photos: photos("garment", "tape_measure"), measurements: [tape({}), tape({ part: "length", value: 28, basis: null, evidence: "tape down the back, 28 in" })] },
      2,
    );
    expect(r.rejected).toEqual([]);
    expect(r.measurements.chest).toMatchObject({ cm: 55.9, basis: "flat", assumed: [] });
    expect(r.measurements.chest?.span).toMatch(/^Photo 2: tape across the chest/);
    expect(r.measurements.length?.cm).toBe(71.1);
  });

  it("refuses a measurement from a photo that isn't a tape measure (no estimating from looks)", () => {
    const r = validateListingPhotos({ photos: photos("garment", "garment"), measurements: [tape({})] }, 2);
    expect(r.measurements).toEqual({});
    expect(r.rejected[0]).toMatch(/isn't a tape measure/);
  });

  it("refuses implausible and malformed readings, and photo numbers that don't exist", () => {
    const r = validateListingPhotos(
      {
        photos: photos("tape_measure"),
        measurements: [tape({ photo: 1, value: 5 }), tape({ photo: 9 }), tape({ photo: 1, evidence: "" }), "22 in"],
      },
      1,
    );
    expect(r.measurements).toEqual({});
    expect(r.rejected).toHaveLength(3);
  });

  it("infers flat vs around when the model can't tell, and flags it", () => {
    const r = validateListingPhotos({ photos: photos("tape_measure"), measurements: [tape({ photo: 1, basis: null })] }, 1);
    expect(r.measurements.chest).toMatchObject({ basis: "flat", assumed: ["basis"] });
  });

  it("keeps a size label only when a photo shows a tag or chart", () => {
    expect(validateListingPhotos({ photos: photos("size_tag"), size_label: "M" }, 1).sizeLabel).toBe("M");
    expect(validateListingPhotos({ photos: photos("garment"), size_label: "M" }, 1).sizeLabel).toBeNull();
  });

  it("keeps a garment size chart, converting inches", () => {
    const r = validateListingPhotos(
      {
        photos: photos("garment", "garment", "size_chart"),
        size_chart: chart({ unit: "in", rows: [{ label: "S", chest: 20 }, { label: "M", chest: 21, length: 28 }] }),
        brand: "Acme",
      },
      3,
    );
    expect(r.chart).toEqual({
      brand: "Acme",
      chestBasis: "flat",
      rows: [
        { label: "S", chest_cm: 50.8, shoulder_cm: null, length_cm: null, sleeve_cm: null },
        { label: "M", chest_cm: 53.3, shoulder_cm: null, length_cm: 71.1, sleeve_cm: null },
      ],
    });
  });

  it("refuses a brand's body-size guide, which isn't the garment's measurements", () => {
    const r = validateListingPhotos({ photos: photos("a", "b", "size_chart"), size_chart: chart({ measures: "body" }) }, 3);
    expect(r.chart).toBeNull();
    expect(r.rejected[0]).toMatch(/body measurements/);
  });

  it("refuses charts out of size order, with one size, implausible values, or from the wrong photo", () => {
    const cases = [
      chart({ rows: [{ label: "S", chest: 56 }, { label: "M", chest: 50 }, { label: "L", chest: 58 }] }),
      chart({ rows: [{ label: "M", chest: 53 }] }),
      chart({ rows: [{ label: "S", chest: 50 }, { label: "M", chest: 530 }] }),
      chart({ photo: 1 }),
    ];
    for (const c of cases) expect(validateListingPhotos({ photos: photos("garment", "x", "size_chart"), size_chart: c }, 3).chart).toBeNull();
  });

  it("survives replies that aren't objects", () => {
    for (const raw of [null, "text", [], { measurements: "x", size_chart: 7 }]) {
      expect(validateListingPhotos(raw, 2).measurements).toEqual({});
    }
  });
});

describe("size charts", () => {
  const valid = validateListingPhotos({ photos: photos("a", "b", "size_chart"), size_chart: chart({}) }, 3).chart!;

  it("gives the listing's own size row as its measurements", () => {
    expect(chartRowMeasurements(valid, "Medium")).toMatchObject({ chest: { cm: 53, basis: "flat" }, length: { cm: 70 } });
    expect(chartRowMeasurements(valid, "XXL")).toBeNull();
    expect(chartRowMeasurements(valid, null)).toBeNull();
  });

  it("round-trips through storage", () => {
    expect(readStoredChart({ chest_basis: valid.chestBasis, rows: valid.rows, brand: null })).toEqual({ ...valid, brand: null });
    expect(readStoredChart({ chest_basis: "sideways", rows: valid.rows, brand: null })).toBeNull();
    expect(readStoredChart({ chest_basis: "flat", rows: [valid.rows[0]], brand: null })).toBeNull();
  });

  it("recommends the size closest to the user's own garment", () => {
    const zipUp: ReferenceGarment = {
      id: "r1",
      title: "grey zip-up",
      category: "knit",
      zone: "ideal",
      measurements: { chest: { cm: 56, basis: "flat", source: "user" }, length: { cm: 72, source: "user" } },
    };
    const listing = { title: "Cardigan", size_label: "M", condition: null, seller_rating: null };
    const effective = effectiveListing(listing, [{ source: "seller", fields: { measurements: {}, category: "knit" } }], null);
    const rec = sizeRecommendation(effective, valid, { body: {}, references: [zipUp] });
    expect(rec?.label).toBe("L");
    expect(rec?.ranked.map((r) => r.label)).toEqual(["L", "M", "S"]);
  });
});
