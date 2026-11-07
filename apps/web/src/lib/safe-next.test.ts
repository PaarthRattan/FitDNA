import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths, with their query and hash", () => {
    expect(safeNext("/passport")).toBe("/passport");
    expect(safeNext("/search?q=wool%20cardigan&fits=1")).toBe("/search?q=wool%20cardigan&fits=1");
    expect(safeNext("/search/abc#map")).toBe("/search/abc#map");
  });

  it("falls back for anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "evil.example",
      "javascript:alert(1)",
      "/\t/evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(safeNext(bad), String(bad)).toBe("/");
    }
  });

  it("uses the given fallback", () => {
    expect(safeNext(null, "/passport")).toBe("/passport");
  });
});
