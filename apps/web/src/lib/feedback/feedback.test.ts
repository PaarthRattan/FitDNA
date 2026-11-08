import { describe, expect, it } from "vitest";
import { agreementSummary, compareZones, describeComparison, parseFeedbackForm, readSnapshot } from "./feedback";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("readSnapshot", () => {
  it("reads a stored prediction", () => {
    const snap = readSnapshot({
      engineVersion: "1",
      overall: "fitted",
      verdict: "Fitted — 2 cm narrower in the shoulders than your zip-up.",
      parts: { chest: { zone: "ideal", deltaCm: 1 }, shoulder: { zone: "fitted" }, length: { zone: null }, sleeve: {} },
    });
    expect(snap).toEqual({
      overall: "fitted",
      parts: { chest: "ideal", shoulder: "fitted", length: null, sleeve: null },
      verdict: "Fitted — 2 cm narrower in the shoulders than your zip-up.",
      engineVersion: "1",
    });
  });

  it("copes with anything, since it's stored JSON", () => {
    for (const raw of [null, "x", [], { overall: "huge", parts: "no" }]) {
      expect(readSnapshot(raw)).toMatchObject({ overall: null, parts: { chest: null }, verdict: null });
    }
  });
});

describe("parseFeedbackForm", () => {
  it("needs the overall fit, and nothing else", () => {
    expect(parseFeedbackForm(form({}))).toMatchObject({ ok: false, errors: { overall: expect.any(String) } });
    expect(parseFeedbackForm(form({ overall: "relaxed" }))).toEqual({ ok: true, value: { overall: "relaxed", parts: {}, kept: null } });
  });

  it("reads parts and whether it was kept, and rejects anything else", () => {
    expect(parseFeedbackForm(form({ overall: "ideal", shoulder: "tight", chest: "", kept: "no" }))).toEqual({
      ok: true,
      value: { overall: "ideal", parts: { shoulder: "tight" }, kept: false },
    });
    expect(parseFeedbackForm(form({ overall: "ideal", sleeve: "huge", kept: "maybe" }))).toMatchObject({
      ok: false,
      errors: { sleeve: expect.any(String), kept: expect.any(String) },
    });
  });
});

describe("comparing predicted and actual", () => {
  it("counts zones, looser as positive", () => {
    expect(compareZones("fitted", "fitted")).toEqual({ steps: 0, agreement: "match" });
    expect(compareZones("fitted", "ideal")).toEqual({ steps: 1, agreement: "close" });
    expect(compareZones("relaxed", "tight")).toEqual({ steps: -3, agreement: "off" });
    expect(compareZones(null, "ideal")).toBeNull();
  });

  it("describes it in words", () => {
    expect(describeComparison("ideal", "ideal")).toBe("Spot on");
    expect(describeComparison("ideal", "relaxed")).toBe("A little looser than predicted");
    expect(describeComparison("ideal", "tight")).toBe("Much tighter than predicted");
  });

  it("summarises how often predictions matched", () => {
    expect(
      agreementSummary([
        { predicted: "ideal", actual: "ideal" },
        { predicted: "ideal", actual: "relaxed" },
        { predicted: "fitted", actual: "oversized" },
        { predicted: null, actual: "ideal" },
      ]),
    ).toEqual({ answered: 3, match: 1, close: 1, off: 1 });
  });
});
