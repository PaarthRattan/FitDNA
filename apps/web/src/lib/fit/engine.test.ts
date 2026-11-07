import { describe, expect, it } from "vitest";
import type { FitZone } from "@/lib/fit-zones";
import { ZONE_STEPS } from "./constants";
import { mergeMeasurements, predictFit, recommendSize, zoneShift } from "./engine";
import { genericMeasurements } from "./generic-sizes";
import type {
  BodyMeasurements,
  FitInput,
  FitPart,
  GarmentMeasurements,
  MeasurementSource,
  ReferenceGarment,
} from "./types";

/** Chest as a circumference unless a basis is given. */
function garment(
  { chest, shoulder, length, sleeve }: Partial<Record<FitPart, number>>,
  source: MeasurementSource = "user",
): GarmentMeasurements {
  return {
    ...(chest !== undefined && { chest: { cm: chest, basis: "circumference" as const, source } }),
    ...(shoulder !== undefined && { shoulder: { cm: shoulder, source } }),
    ...(length !== undefined && { length: { cm: length, source } }),
    ...(sleeve !== undefined && { sleeve: { cm: sleeve, source } }),
  };
}

const BASE = { chest: 100, shoulder: 45, length: 70, sleeve: 62 };

function reference(zone: FitZone = "ideal", values = BASE, extra: Partial<ReferenceGarment> = {}): ReferenceGarment {
  return { id: `ref-${zone}`, title: "zip-up", category: "knit", zone, measurements: garment(values), ...extra };
}

function input(candidate: GarmentMeasurements, references = [reference()], body: BodyMeasurements = {}): FitInput {
  return { body, references, candidate: { category: "knit", measurements: candidate } };
}

describe("zone boundaries, every part", () => {
  const parts: FitPart[] = ["chest", "shoulder", "length", "sleeve"];

  for (const part of parts) {
    const { deadband, step } = ZONE_STEPS[part];
    const cases: Array<[number, FitZone]> = [
      [-(deadband + step), "tight"],
      [-(deadband + step - 0.1), "fitted"],
      [-(deadband + 0.1), "fitted"],
      [-deadband, "ideal"],
      [0, "ideal"],
      [deadband, "ideal"],
      [deadband + 0.1, "relaxed"],
      [deadband + step - 0.1, "relaxed"],
      [deadband + step, "oversized"],
    ];
    for (const [delta, zone] of cases) {
      it(`${part} ${delta > 0 ? "+" : ""}${delta.toFixed(1)} cm → ${zone}`, () => {
        const candidate = garment({ [part]: BASE[part] + delta });
        expect(predictFit(input(candidate)).parts[part].zone).toBe(zone);
      });
    }
  }

  it("doesn't round a near-boundary ratio up into the next zone (regression)", () => {
    // 7.9 cm over is 4.9 cm past the 3 cm deadband: still one step, not two.
    expect(zoneShift("chest", 7.9)).toBe(1);
    expect(zoneShift("chest", 8)).toBe(2);
  });
});

describe("anchoring on the reference", () => {
  it("an identical garment lands in the reference's own zone (the 0 cm anchor)", () => {
    for (const zone of ["tight", "fitted", "ideal", "relaxed", "oversized"] as FitZone[]) {
      const prediction = predictFit(input(garment(BASE), [reference(zone)]));
      expect(prediction.overall).toBe(zone);
      expect(prediction.parts.chest.deltaCm).toBe(0);
    }
  });

  it("clamps at the ends of the scale", () => {
    const candidate = garment({ chest: BASE.chest + 20 });
    expect(predictFit(input(candidate, [reference("relaxed")])).parts.chest.zone).toBe("oversized");
  });

  it("prefers the reference closest to ideal when a category has several", () => {
    const fitted = reference("fitted", { ...BASE, chest: 94 }, { id: "fitted", title: "old tee" });
    const ideal = reference("ideal", BASE, { id: "ideal", title: "zip-up" });
    const prediction = predictFit(input(garment(BASE), [fitted, ideal]));
    expect(prediction.parts.chest.anchor).toEqual({ kind: "reference", referenceId: "ideal", referenceTitle: "zip-up" });
    expect(prediction.parts.chest.zone).toBe("ideal");
  });

  it("never compares against a reference from another category", () => {
    const jacket = reference("ideal", BASE, { category: "jacket" });
    const prediction = predictFit(input(garment(BASE), [jacket]));
    expect(prediction.parts.chest.anchor.kind).toBe("none");
    expect(prediction.overall).toBeNull();
  });
});

describe("pit to pit", () => {
  it("doubles a flat chest before comparing", () => {
    const candidate: GarmentMeasurements = { chest: { cm: 50, basis: "flat", source: "seller" } };
    const prediction = predictFit(input(candidate));
    expect(prediction.parts.chest.deltaCm).toBe(0);
    expect(prediction.parts.chest.zone).toBe("ideal");
  });

  it("doubles a flat reference chest too", () => {
    const flatRef = reference("ideal", BASE, {
      measurements: { chest: { cm: 50, basis: "flat", source: "user" } },
    });
    expect(predictFit(input(garment({ chest: 100 }), [flatRef])).parts.chest.zone).toBe("ideal");
  });

  it("reads an undoubled p2p as far too small, which is why basis is modelled", () => {
    const wrong: GarmentMeasurements = { chest: { cm: 50, basis: "circumference", source: "seller" } };
    expect(predictFit(input(wrong)).parts.chest.zone).toBe("tight");
  });
});

describe("stretch", () => {
  it("lets a stretchy garment come in under the reference without reading tight", () => {
    const candidate = garment({ chest: BASE.chest - 5 });
    const rigid = predictFit(input(candidate));
    const stretchy = predictFit({ ...input(candidate), candidate: { category: "knit", stretch: "high", measurements: candidate } });
    expect(rigid.parts.chest.zone).toBe("fitted");
    expect(stretchy.parts.chest.zone).toBe("ideal");
    // The reported difference stays the real one.
    expect(stretchy.parts.chest.deltaCm).toBe(-5);
  });

  it("does nothing for a garment that's already roomier", () => {
    const candidate = garment({ chest: BASE.chest + 4 });
    const stretchy = predictFit({ ...input(candidate), candidate: { category: "knit", stretch: "high", measurements: candidate } });
    expect(stretchy.parts.chest.zone).toBe("relaxed");
  });
});

describe("source precedence", () => {
  it("keeps the highest-ranked source per part", () => {
    const merged = mergeMeasurements([
      garment({ chest: 104, length: 72 }, "ai_text"),
      garment({ chest: 100 }, "seller"),
      garment({ length: 69 }, "user"),
    ]);
    expect(merged.chest).toEqual({ cm: 100, basis: "circumference", source: "seller" });
    expect(merged.length).toEqual({ cm: 69, source: "user" });
  });

  it("lowers confidence for weaker sources without changing the zone", () => {
    const seller = predictFit(input(garment(BASE, "seller")));
    const estimated = predictFit(input(garment(BASE, "estimated")));
    expect(estimated.overall).toBe(seller.overall);
    expect(estimated.confidence).toBeLessThan(seller.confidence);
  });
});

describe("missing data", () => {
  it("leaves unmeasured parts out and lowers confidence", () => {
    const full = predictFit(input(garment(BASE)));
    const chestOnly = predictFit(input(garment({ chest: BASE.chest })));
    expect(chestOnly.parts.length.zone).toBeNull();
    expect(chestOnly.parts.length.anchor.kind).toBe("none");
    expect(chestOnly.confidence).toBeLessThan(full.confidence);
  });

  it("says so when nothing can be compared", () => {
    const prediction = predictFit(input({}, []));
    expect(prediction.overall).toBeNull();
    expect(prediction.confidence).toBe(0);
    expect(prediction.verdict).toBe("Not enough measurements to predict the fit yet.");
  });
});

describe("body-anchored fallback", () => {
  const body: BodyMeasurements = {
    chest: { cm: 96, confidence: 80 },
    shoulder: { cm: 44, confidence: 80 },
    arm: { cm: 63, confidence: 80 },
  };

  it("uses the category's default ease when there's no reference", () => {
    // Knit ideal chest ease is 14 cm: 96 + 14 = 110.
    const prediction = predictFit(input(garment({ chest: 110, shoulder: 46, length: 68 }), [], body));
    expect(prediction.parts.chest.anchor.kind).toBe("body");
    expect(prediction.parts.chest.zone).toBe("ideal");
    expect(prediction.parts.shoulder.zone).toBe("ideal");
    // Length has no body anchor.
    expect(prediction.parts.length.zone).toBeNull();
  });

  it("trusts a body comparison less than a reference comparison", () => {
    const viaBody = predictFit(input(garment({ chest: 110 }), [], body));
    const viaRef = predictFit(input(garment({ chest: 100 })));
    expect(viaBody.parts.chest.confidence).toBeLessThan(viaRef.parts.chest.confidence);
  });

  it("doesn't compare tee sleeves with arm length", () => {
    const prediction = predictFit({ body, references: [], candidate: { category: "tee", measurements: garment({ sleeve: 20 }) } });
    expect(prediction.parts.sleeve.zone).toBeNull();
  });
});

describe("overall zone", () => {
  it("is driven by the part furthest from ideal", () => {
    const candidate = garment({ ...BASE, shoulder: BASE.shoulder - 4 }); // shoulder: −4 → tight
    expect(predictFit(input(candidate)).overall).toBe("tight");
  });

  it("breaks ties in favour of the shoulders", () => {
    const candidate = garment({ ...BASE, chest: BASE.chest + 5, shoulder: BASE.shoulder - 2 });
    const prediction = predictFit(input(candidate));
    expect(prediction.parts.chest.zone).toBe("relaxed");
    expect(prediction.parts.shoulder.zone).toBe("fitted");
    expect(prediction.overall).toBe("fitted");
  });

  it("weights length less than chest", () => {
    // Length two zones out (weight 0.5 → 1) ties with chest one zone out (weight 1 → 1); chest wins.
    const candidate = garment({ ...BASE, chest: BASE.chest + 5, length: BASE.length + 6 });
    expect(predictFit(input(candidate)).overall).toBe("relaxed");
  });
});

describe("verdict", () => {
  it("names the biggest difference against the reference", () => {
    const candidate = garment({ ...BASE, shoulder: BASE.shoulder - 2 });
    expect(predictFit(input(candidate)).verdict).toBe("Fitted — 2 cm narrower in the shoulders than your zip-up.");
  });

  it("says when it matches the reference", () => {
    expect(predictFit(input(garment(BASE))).verdict).toBe("Your kind of fit — matches your zip-up.");
  });

  it("phrases body comparisons without a reference", () => {
    const body: BodyMeasurements = { chest: { cm: 96, confidence: 80 } };
    expect(predictFit(input(garment({ chest: 116 }), [], body)).verdict).toBe(
      "Relaxed — 6 cm wider through the chest than a typical knit on you.",
    );
  });
});

describe("size recommendation", () => {
  const chart = ["S", "M", "L"].map((label, i) => ({
    label,
    measurements: garment({ chest: 92 + i * 8, shoulder: 43 + i * 2, length: 68 + i * 2, sleeve: 60 + i * 2 }, "size_chart"),
  }));

  it("picks the size closest to the user's ideal", () => {
    const recommendation = recommendSize(input({}), chart)!;
    expect(recommendation.label).toBe("M");
    expect(recommendation.ranked[0].label).toBe("M");
    expect(recommendation.prediction.overall).toBe("ideal");
  });

  it("doesn't let the listed size's own measurements override other sizes", () => {
    const listedAsL = garment({ chest: 108, shoulder: 47, length: 72, sleeve: 64 }, "seller");
    expect(recommendSize(input(listedAsL), chart)!.label).toBe("M");
  });

  it("returns null without a chart", () => {
    expect(recommendSize(input({}), [])).toBeNull();
  });
});

describe("generic sizes", () => {
  it("returns estimated measurements for letter sizes, including aliases", () => {
    const m = genericMeasurements("knit", "Medium")!;
    expect(m.chest).toEqual({ cm: 106, basis: "circumference", source: "estimated" });
    expect(genericMeasurements("knit", " m ")).toEqual(m);
  });

  it("returns undefined for sizes it doesn't know", () => {
    expect(genericMeasurements("jacket", "3")).toBeUndefined();
  });
});
