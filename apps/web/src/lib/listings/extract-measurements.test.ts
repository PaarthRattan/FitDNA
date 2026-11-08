import { describe, expect, it } from "vitest";
import {
  extractCondition,
  extractListing,
  extractMeasurements,
  extractSize,
  extractionConfidence,
  guessCategory,
} from "./extract-measurements";

/*
 * Synthetic examples of how resale sellers write measurements. They stand in for the
 * real sample of 100 listings the plan calls for, which hasn't been collected yet;
 * when it is, add those pages here as fixtures.
 */

const cm = (text: string) =>
  Object.fromEntries(Object.entries(extractMeasurements(text).measurements).map(([k, v]) => [k, v.cm]));

describe("extractMeasurements: common formats", () => {
  it("reads labelled inches with quote marks", () => {
    const { measurements } = extractMeasurements(`Pit to pit: 22"\nLength: 28"\nShoulder: 18"\nSleeve: 25"`);
    expect(measurements.chest).toMatchObject({ cm: 55.9, basis: "flat", unit: "in", assumed: [] });
    expect(measurements.length).toMatchObject({ cm: 71.1, unit: "in" });
    expect(measurements.shoulder).toMatchObject({ cm: 45.7 });
    expect(measurements.sleeve).toMatchObject({ cm: 63.5 });
  });

  it("reads centimetres and keeps the source text", () => {
    const { measurements } = extractMeasurements("Measurements: armpit to armpit 56 cm, length 70 cm, shoulders 46 cm");
    expect(measurements.chest).toMatchObject({ cm: 56, basis: "flat", unit: "cm", span: "armpit to armpit 56 cm" });
    expect(measurements.length?.cm).toBe(70);
    expect(measurements.shoulder?.cm).toBe(46);
  });

  it("reads markdown bold labels, tables and escaped quotes", () => {
    expect(cm(`**P2P:** 21.5\\"  \n**Length:** 27\\"`)).toEqual({ chest: 54.6, length: 68.6 });
    expect(cm(`| Measurement | Inches |\n|---|---|\n| Pit to pit | 23 |\n| Length | 29 |`)).toEqual({
      chest: 58.4,
      length: 73.7,
    });
  });

  it("reads value-first phrasing", () => {
    expect(cm(`22" pit to pit, 28" length, 25 inches sleeve`)).toEqual({ chest: 55.9, length: 71.1, sleeve: 63.5 });
  });

  it("reads fractions, comma decimals and approximations", () => {
    expect(cm("Pit to pit 22 1/2 in")).toEqual({ chest: 57.2 });
    expect(cm("P2P ~ 22½ inches")).toEqual({ chest: 57.2 });
    expect(cm("Chest (flat): 56,5 cm")).toEqual({ chest: 56.5 });
    expect(cm("Length: approx. 70cm")).toEqual({ length: 70 });
  });

  it("takes the midpoint of a narrow range and says so", () => {
    const { measurements } = extractMeasurements("Pit to pit: 22-23 in");
    expect(measurements.chest).toMatchObject({ cm: 57.2, assumed: ["range"] });
  });

  it("accepts the same value written in both units", () => {
    expect(cm(`Pit to pit: 22" (56 cm)\nLength: 28"/71cm`)).toEqual({ chest: 55.9, length: 71.1 });
  });

  it("treats 'shoulder to hem' as length and 'shoulder to cuff' as sleeve", () => {
    expect(cm(`Shoulder to hem: 28"\nShoulder to cuff: 24"\nShoulder to shoulder: 18"`)).toEqual({
      length: 71.1,
      sleeve: 61,
      shoulder: 45.7,
    });
  });

  it("treats 'sleeve length' as sleeve, not body length", () => {
    expect(cm(`Sleeve length: 25"\nBody length: 28"`)).toEqual({ sleeve: 63.5, length: 71.1 });
  });
});

describe("extractMeasurements: flat vs all the way around", () => {
  it("knows pit to pit is flat", () => {
    expect(extractMeasurements("p2p 22 in").measurements.chest?.basis).toBe("flat");
  });

  it("reads an explicit circumference", () => {
    expect(extractMeasurements("Chest circumference: 112 cm").measurements.chest).toMatchObject({
      cm: 112,
      basis: "circumference",
      assumed: [],
    });
  });

  it("follows a qualifier after a plain 'chest'", () => {
    expect(extractMeasurements("Chest: 22 in (flat)").measurements.chest).toMatchObject({ basis: "flat", assumed: [] });
    expect(extractMeasurements("Chest 22 x 2").measurements.chest?.basis).toBe("flat");
  });

  it("infers the basis of a plain 'chest' from its size, and flags it", () => {
    expect(extractMeasurements("Chest: 22 in").measurements.chest).toMatchObject({ cm: 55.9, basis: "flat", assumed: ["basis"] });
    expect(extractMeasurements("Chest: 44 in").measurements.chest).toMatchObject({
      cm: 111.8,
      basis: "circumference",
      assumed: ["basis"],
    });
  });

  it("leaves out a plain chest that could be either", () => {
    expect(extractMeasurements("Chest: 78 cm").measurements.chest).toBeUndefined();
  });
});

describe("extractMeasurements: units", () => {
  it("uses the unit the page states for unitless numbers", () => {
    const { measurements } = extractMeasurements("All measurements in inches.\nPit to pit 22\nLength 28\nSleeve 25");
    expect(measurements.chest).toMatchObject({ cm: 55.9, unit: "in", assumed: [] });
    expect(measurements.sleeve?.cm).toBe(63.5);
  });

  it("reads a unit in a column header", () => {
    expect(cm("Chest (in): 22")).toEqual({ chest: 55.9 });
  });

  it("infers inches or cm from plausibility, and flags it", () => {
    const { measurements } = extractMeasurements("Pit to pit 22\nShoulder 46");
    expect(measurements.chest).toMatchObject({ unit: "in", assumed: ["unit"] });
    expect(measurements.shoulder).toMatchObject({ unit: "cm", cm: 46, assumed: ["unit"] });
  });

  it("settles an ambiguous number by the unit the rest of the page uses", () => {
    // A sleeve of "25" could be inches or cm; the other numbers are clearly inches.
    const { measurements } = extractMeasurements("Pit to pit 22\nLength 28\nSleeve 25");
    expect(measurements.sleeve).toMatchObject({ unit: "in", cm: 63.5, assumed: ["unit"] });
  });

  it("drops a number that is ambiguous with nothing to settle it", () => {
    expect(extractMeasurements("Sleeve 25").measurements.sleeve).toBeUndefined();
  });
});

describe("extractMeasurements: what it refuses to read", () => {
  it("ignores implausible values", () => {
    expect(cm(`Pit to pit: 5"\nLength: 300 cm`)).toEqual({});
  });

  it("ignores size-chart rows with a value per size", () => {
    expect(cm("Size chart\n| | S | M | L |\n| Chest | 50 | 52 | 54 |\n| Length | 68 | 70 | 72 |")).toEqual({});
  });

  it("ignores the model's or the wearer's body", () => {
    expect(cm(`Model's chest: 38"\nModel is 6ft and fits chest 40`)).toEqual({});
  });

  it("ignores eBay's 'Chest Size', which is the wearer's size", () => {
    const md = `| Size | L |\n| Chest Size | 42 in |\n\nMeasurements laying flat:\nArmpit to armpit 23"`;
    expect(cm(md)).toEqual({ chest: 58.4 });
  });

  it("ignores percentages and unrelated numbers", () => {
    expect(cm("Long sleeve, 100% cotton. 2 pockets.")).toEqual({});
  });

  it("ignores underarm and centre-back sleeve measurements", () => {
    expect(cm(`Sleeve (underarm): 19"\nSleeve (center back): 34"`)).toEqual({});
  });

  it("leaves out a part given twice with different values", () => {
    const result = extractMeasurements(`Pit to pit: 22"\nLength 28"\nPit to pit: 24"`);
    expect(result.measurements.chest).toBeUndefined();
    expect(result.conflicting).toEqual(["chest"]);
    expect(result.measurements.length?.cm).toBe(71.1);
  });

  it("accepts the same part given twice with the same value", () => {
    expect(cm(`Pit to pit: 22"\nChest (flat): 56 cm`)).toEqual({ chest: 55.9 });
  });

  it("ignores numbers in link targets and images", () => {
    expect(cm("[Length guide](https://example.test/length-28)\n![chest 22](https://img.test/x.jpg)")).toEqual({});
  });

  it("drops two different numbers that only look like a range", () => {
    expect(cm("Pit to pit 22 - 56cm")).toEqual({});
  });
});

describe("extractMeasurements: page layouts seen on real listings", () => {
  // Shapes copied from real pages fetched through Firecrawl (Grailed, Poshmark, Depop), shortened.
  it("reads Grailed's measurement block: one item per line, each in both units", () => {
    const md = "Measurements\n\nMeasured with garment laid flat.\n\nChest\n\n20.5 in\n\n52.1 cm\n\nLength\n\n27 in\n\n68.6 cm\n\nShoulders\n\n19.5 in\n\n49.5 cm\n\nSleeve Length\n\n24 in\n\n61 cm";
    const { measurements, conflicting } = extractMeasurements(md);
    expect(conflicting).toEqual([]);
    expect(measurements).toMatchObject({
      chest: { cm: 52.1, basis: "flat", assumed: [] },
      length: { cm: 68.6 },
      shoulder: { cm: 49.5 },
      sleeve: { cm: 61 },
    });
  });

  it("never reads a value-first measurement across a line break", () => {
    // "68.6 cm" ends one item and "Shoulders" starts the next; it isn't a shoulder of 68.6.
    expect(cm("Length 27 in\n68.6 cm\nShoulders 19.5 in")).toEqual({ length: 68.6, shoulder: 49.5 });
    expect(cm("Ptp 25 fo 27 inches\nfull length 25 to 26 inches")).toEqual({ chest: 63.5, length: 64.8 });
  });

  it("accepts a second unit on the next line only when it's the same value", () => {
    expect(cm("Chest\n\n20.5 in\n\n60 cm")).toEqual({});
  });

  it("prefers the reading that needed fewer assumptions when two agree", () => {
    const { measurements } = extractMeasurements("Chest: 52 cm\nPit to pit: 20.5in");
    expect(measurements.chest).toMatchObject({ basis: "flat", assumed: [] });
  });

  it("ignores 'similar items' cards, which are links", () => {
    const md = "[![Sweatshirt](https://img.test/1.jpg)\\\n\\\nSweatshirt - Size S, pit to pit 30 in\\\n$16.00](https://www.mercari.com/us/item/m1/)";
    expect(cm(md)).toEqual({});
    expect(extractSize(md)).toBeNull();
  });
});

describe("extractListing: the description tag", () => {
  it("reads measurements the page body lacks (Depop)", () => {
    const listing = extractListing({
      title: "1990’s Basic Editions Ringer tshirt",
      markdown: "Size XXL\n\nGood condition",
      description: "1990’s Basic Editions Ringer tshirt\nXL/XXL\n24” pit to pit \n27” collar to hem",
    });
    expect(listing.measurements).toMatchObject({ chest: { cm: 61, basis: "flat" }, length: { cm: 68.6 } });
    expect(listing).toMatchObject({ category: "tee", sizeLabel: "XXL", condition: "good" });
  });

  it("never overrides or contradicts the page's own numbers", () => {
    const listing = extractListing({ title: "tee", markdown: `Pit to pit: 22.5"`, description: "Pit to pit 22" });
    expect(listing.measurements.chest?.cm).toBe(57.2);
    expect(listing.conflicting).toEqual([]);
  });
});

describe("extractSize", () => {
  it("reads letter and number sizes", () => {
    expect(extractSize("Wool zip cardigan size 3")).toBe("3");
    expect(extractSize("Size: M")).toBe("M");
    expect(extractSize("Tagged XL, fits like a L")).toBe("XL");
    expect(extractSize("Size: Medium")).toBe("M");
    expect(extractSize("Size 48 EU")).toBe("48");
  });

  it("prefers the title, then the page", () => {
    expect(extractSize("Vintage tee size L", "Size: M")).toBe("L");
    expect(extractSize("Vintage tee", "Size: M")).toBe("M");
  });

  it("reads region prefixes and Grailed's header, earliest first", () => {
    expect(extractSize("Size\n\nUS M / EU 48-50")).toBe("M");
    expect(extractSize("Men's US M / EU 48-50 / 2•Gently Used\n\nSize 4 - fits a medium well")).toBe("M");
    expect(extractSize("Size\n\n\n\nM (8-10)")).toBe("M");
  });

  it("doesn't read a measurement or 'size chart' as a size", () => {
    expect(extractSize("See size chart")).toBeNull();
    expect(extractSize("true to size 22 in")).toBeNull();
  });
});

describe("extractCondition", () => {
  it("reads a labelled condition", () => {
    expect(extractCondition("Condition: Used - Excellent")).toBe("excellent");
    expect(extractCondition("Condition: Gently used")).toBe("good");
    expect(extractCondition("Condition: New with tags")).toBe("new");
    expect(extractCondition("Condition: Like new")).toBe("like_new");
    expect(extractCondition("Condition: Fair, some pilling")).toBe("fair");
  });

  it("reads NWT and NWOT", () => {
    expect(extractCondition("Wool sweater NWT")).toBe("new");
    expect(extractCondition("NWOT, never worn")).toBe("like_new");
  });

  it("reads unlabelled phrases sites use", () => {
    expect(extractCondition("Men's US M•Gently Used")).toBe("good");
    expect(extractCondition("Size XXL\n\nGood condition")).toBe("good");
    expect(extractCondition("Size XXL", "Sweater cardigan, from a 5-star seller. Excellent condition.")).toBe("excellent");
    expect(extractCondition("Condition\nLike new")).toBe("like_new");
  });

  it("ignores condition words without a label", () => {
    expect(extractCondition("Good quality wool, great colour")).toBeNull();
  });
});

describe("guessCategory", () => {
  it.each([
    ["Wool zip cardigan", "knit"],
    ["Heavyweight hoodie", "knit"],
    ["Vintage sweatshirt", "knit"],
    ["Boxy T-shirt", "tee"],
    ["Single stitch tee", "tee"],
    ["Oxford button-down shirt", "shirt"],
    ["Flannel overshirt", "shirt"],
    ["Shirt jacket in wool", "jacket"],
    ["Levi's trucker", "jacket"],
    ["Selvedge jeans", "out_of_scope"],
    ["Leather boots", "out_of_scope"],
    ["Mystery item", null],
  ])("%s → %s", (title, category) => {
    expect(guessCategory(title)).toBe(category);
  });
});

describe("extractListing", () => {
  it("puts it all together", () => {
    const listing = extractListing({
      title: "Wool zip cardigan · size 3",
      markdown: `Condition: Used - Excellent\n\nMeasurements (in):\n- Pit to pit: 22\n- Length: 27\n- Sleeve: 25`,
    });
    expect(listing).toMatchObject({ category: "knit", sizeLabel: "3", condition: "excellent", conflicting: [] });
    expect(Object.keys(listing.measurements).sort()).toEqual(["chest", "length", "sleeve"]);
  });

  it("is less confident when it had to assume", () => {
    const sure = extractListing({ title: "tee", markdown: `Pit to pit 22"` });
    const unsure = extractListing({ title: "tee", markdown: "Chest 22" });
    expect(extractionConfidence(sure)).toBe(1);
    expect(extractionConfidence(unsure)).toBeLessThan(1);
    expect(extractionConfidence(extractListing({ title: "tee", markdown: "no numbers" }))).toBe(0);
  });
});
