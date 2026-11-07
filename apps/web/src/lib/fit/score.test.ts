import { describe, expect, it } from "vitest";
import type { FitZone } from "@/lib/fit-zones";
import { predictFit } from "./engine";
import { fitsMe, purchaseScore } from "./score";
import type { FitPrediction } from "./types";

function prediction(overall: FitZone | null, confidence: number): FitPrediction {
  return { ...predictFit({ body: {}, references: [], candidate: { category: "knit", measurements: {} } }), overall, confidence };
}

const component = (result: ReturnType<typeof purchaseScore>, key: string) =>
  result.components.find((c) => c.key === key)!.value;

describe("purchaseScore", () => {
  it("is just the fit component when nothing else is known", () => {
    expect(purchaseScore({ prediction: prediction("ideal", 100) }).score).toBe(100);
  });

  it("discounts fit by measurement confidence", () => {
    // 100 × (0.4 + 0.6 × 0.5) = 70
    expect(purchaseScore({ prediction: prediction("ideal", 50) }).score).toBe(70);
  });

  it("re-normalises weights over the components present", () => {
    // (0.6 × 100 + 0.15 × 70) / 0.75 = 94
    const result = purchaseScore({ prediction: prediction("ideal", 100), condition: "good" });
    expect(result.score).toBe(94);
    expect(component(result, "price")).toBeNull();
    expect(component(result, "seller")).toBeNull();
  });

  it("leaves price out until there's enough history", () => {
    const base = { prediction: prediction("ideal", 100), price: 78 };
    expect(component(purchaseScore({ ...base, priceHistory: [100, 100, 100, 100] }), "price")).toBeNull();
    // 22% under a median of 100 → 72
    expect(component(purchaseScore({ ...base, priceHistory: [90, 100, 100, 110, 120] }), "price")).toBe(72);
  });

  it("maps seller ratings so 3★ is 0 and 5★ is 100", () => {
    const at = (rating: number) => component(purchaseScore({ prediction: prediction("ideal", 100), sellerRating: rating }), "seller");
    expect(at(5)).toBe(100);
    expect(at(4.9)).toBe(95);
    expect(at(3)).toBe(0);
    expect(at(1)).toBe(0);
  });

  it("scores further-from-ideal fits lower", () => {
    const score = (zone: FitZone) => purchaseScore({ prediction: prediction(zone, 100) }).score!;
    expect(score("ideal")).toBeGreaterThan(score("fitted"));
    expect(score("fitted")).toBe(score("relaxed"));
    expect(score("relaxed")).toBeGreaterThan(score("oversized"));
  });

  it("has no score when fit can't be predicted, but still lists the components", () => {
    const result = purchaseScore({ prediction: prediction(null, 0), condition: "new" });
    expect(result.score).toBeNull();
    expect(component(result, "condition")).toBe(100);
  });
});

describe("fitsMe", () => {
  it("passes in-range fits with a good score", () => {
    expect(fitsMe("relaxed", 75)).toBe(true);
    expect(fitsMe("ideal", 70)).toBe(true);
  });

  it("rejects tight, oversized, low-scoring and unknown fits", () => {
    expect(fitsMe("oversized", 90)).toBe(false);
    expect(fitsMe("tight", 90)).toBe(false);
    expect(fitsMe("ideal", 69)).toBe(false);
    expect(fitsMe(null, null)).toBe(false);
  });
});
