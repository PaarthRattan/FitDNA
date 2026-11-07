import { describe, expect, it } from "vitest";
import { predictFit } from "@/lib/fit/engine";
import { measurementChips, toBodyMeasurements, toReferenceGarment, type ReferenceRow } from "./mappers";
import { echo, isUuid, parseBodyForm, parseGarmentForm, parsePreferencesForm, toCm } from "./parse";
import { passportStatus } from "./status";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const garment = (overrides: Record<string, string> = {}) =>
  form({ title: "grey zip-up", category: "knit", chest: "56", chestBasis: "flat", fitZone: "ideal", unit: "cm", ...overrides });

describe("parseBodyForm", () => {
  it("reads centimetres and accepts a decimal comma", () => {
    expect(parseBodyForm(form({ unit: "cm", chest: "96,5", shoulder: "45", arm: "" }))).toEqual({
      ok: true,
      value: { chest: 96.5, shoulder: 45 },
    });
  });

  it("converts inches to centimetres", () => {
    expect(parseBodyForm(form({ unit: "in", chest: "38" }))).toEqual({ ok: true, value: { chest: 96.5 } });
    expect(toCm(38, "in")).toBe(96.5);
  });

  it("rejects values outside the plausible range, in both units", () => {
    const tooSmall = parseBodyForm(form({ unit: "cm", chest: "38" }));
    expect(tooSmall).toEqual({ ok: false, errors: { chest: "Chest should be between 60 and 200 cm (24–79 in)." } });
    // 96 inches is 243.8 cm: someone typed cm with inches selected.
    expect(parseBodyForm(form({ unit: "in", chest: "96" })).ok).toBe(false);
  });

  it("rejects things that aren't plain positive numbers", () => {
    for (const bad of ["abc", "-90", "0", "1e3", "96.", "9 6"]) {
      const result = parseBodyForm(form({ unit: "cm", chest: bad }));
      expect(result.ok, bad).toBe(false);
    }
  });

  it("needs at least one measurement and a known unit", () => {
    expect(parseBodyForm(form({ unit: "cm" }))).toEqual({ ok: false, errors: { form: "Enter at least one measurement." } });
    expect(parseBodyForm(form({ unit: "furlongs", chest: "96" }))).toEqual({
      ok: false,
      errors: { unit: "Choose centimetres or inches." },
    });
  });
});

describe("parseGarmentForm", () => {
  it("parses a complete garment", () => {
    const result = parseGarmentForm(
      garment({ sizeLabel: " M ", shoulder: "47", length: "66", sleeve: "63", stretch: "low" }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        title: "grey zip-up",
        category: "knit",
        sizeLabel: "M",
        chestCm: 56,
        chestBasis: "flat",
        shoulderCm: 47,
        lengthCm: 66,
        sleeveCm: 63,
        stretch: "low",
        fitZone: "ideal",
      },
    });
  });

  it("checks the chest range against how it was measured", () => {
    // 112 is a plausible circumference but not a plausible flat width.
    expect(parseGarmentForm(garment({ chest: "112", chestBasis: "flat" })).ok).toBe(false);
    expect(parseGarmentForm(garment({ chest: "112", chestBasis: "circumference" })).ok).toBe(true);
  });

  it("requires a name, category, chest and fit, and reports them all at once", () => {
    const result = parseGarmentForm(form({ unit: "cm" }));
    expect(result.ok).toBe(false);
    expect(Object.keys((result as { errors: object }).errors).sort()).toEqual(["category", "chest", "fitZone", "title"]);
  });

  it("rejects values that aren't one of the offered choices", () => {
    const result = parseGarmentForm(garment({ category: "trousers", stretch: "elastic", chestBasis: "diagonal", fitZone: "snug" }));
    expect(Object.keys((result as { errors: object }).errors).sort()).toEqual(["category", "chestBasis", "fitZone", "stretch"]);
  });

  it("limits text lengths", () => {
    expect(parseGarmentForm(garment({ title: "x".repeat(81) })).ok).toBe(false);
    expect(parseGarmentForm(garment({ sizeLabel: "x".repeat(21) })).ok).toBe(false);
  });
});

describe("parsePreferencesForm", () => {
  it("keeps non-empty notes per category and limits their length", () => {
    expect(parsePreferencesForm(form({ tee: " fitted through the chest ", knit: "" }))).toEqual({
      ok: true,
      value: { tee: "fitted through the chest" },
    });
    expect(parsePreferencesForm(form({ jacket: "x".repeat(501) })).ok).toBe(false);
  });
});

describe("form helpers", () => {
  it("echoes submitted values so a form can be refilled", () => {
    expect(echo(form({ chest: " 96 ", other: "x" }), ["chest", "arm"])).toEqual({ chest: "96", arm: "" });
  });

  it("recognises UUIDs", () => {
    expect(isUuid("00000000-0000-4000-8000-00000000000a")).toBe(true);
    expect(isUuid("1; drop table")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe("passportStatus", () => {
  it("counts each body measurement and up to three reference categories", () => {
    expect(passportStatus([], []).pct).toBe(0);
    expect(passportStatus(["chest", "shoulder", "arm"], []).pct).toBe(50);
    expect(passportStatus(["chest", "shoulder", "arm"], ["knit", "tee", "jacket"]).pct).toBe(100);
  });

  it("counts categories, not garments", () => {
    expect(passportStatus([], ["knit", "knit", "knit"]).pct).toBe(17);
    expect(passportStatus([], ["knit", "tee"]).pct).toBe(33);
  });

  it("points at the first missing step", () => {
    expect(passportStatus(["chest"], []).next?.label).toBe("Measure your shoulder width");
    expect(passportStatus(["chest", "shoulder", "arm"], ["knit"]).next?.href).toBe("/passport/garments/new");
    expect(passportStatus(["chest", "shoulder", "arm"], ["knit", "tee", "shirt"]).next).toBeNull();
  });
});

describe("mappers", () => {
  const row: ReferenceRow = {
    id: "00000000-0000-4000-8000-0000000000aa",
    user_id: "00000000-0000-4000-8000-00000000000a",
    title: "grey zip-up",
    category: "knit",
    size_label: "M",
    chest_cm: 56,
    chest_basis: "flat",
    shoulder_cm: 47,
    length_cm: null,
    sleeve_cm: 63,
    stretch: "low",
    fit_zone: "ideal",
    created_at: "2026-11-07T00:00:00Z",
    updated_at: "2026-11-07T00:00:00Z",
  };

  it("turns a database row into an engine reference the engine can use", () => {
    const reference = toReferenceGarment(row);
    expect(reference.measurements).toEqual({
      chest: { cm: 56, basis: "flat", source: "user" },
      shoulder: { cm: 47, source: "user" },
      sleeve: { cm: 63, source: "user" },
    });
    const prediction = predictFit({
      body: {},
      references: [reference],
      candidate: { category: "knit", measurements: { chest: { cm: 112, basis: "circumference", source: "seller" } } },
    });
    expect(prediction.parts.chest.zone).toBe("ideal");
  });

  it("fails loudly on a value the database should never hold", () => {
    expect(() => toReferenceGarment({ ...row, category: "trousers" })).toThrow(/Unexpected garment category/);
  });

  it("keeps only the body measurements the engine uses", () => {
    expect(
      toBodyMeasurements([
        { name: "chest", value_cm: 96, confidence: 60 },
        { name: "waist", value_cm: 82, confidence: 60 },
      ]),
    ).toEqual({ chest: { cm: 96, confidence: 60 } });
  });

  it("labels measurements for display", () => {
    expect(measurementChips(row)).toEqual(["CHEST 56 CM FLAT", "SHOULDER 47 CM", "SLEEVE 63 CM", "LOW STRETCH"]);
  });
});
