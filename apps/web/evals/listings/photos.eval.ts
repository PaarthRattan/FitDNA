import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiEnabled, chatJson, modelFor, type ContentPart } from "@/lib/ai/client";
import {
  LISTING_PHOTOS_MAX_TOKENS,
  LISTING_PHOTOS_SYSTEM,
  chartRowMeasurements,
  validateListingPhotos,
  type ListingPhotosResult,
} from "@/lib/ai/tasks/listing-photos";

/*
 * `npm run eval` (photos): the vision model and the validator on rendered test images
 * in evals/listings/photos/: a garment size chart, a brand's body-size guide (which
 * must be rejected), and a size tag. Real tape-measure photos should be added as
 * they're collected. Calls the real model, so it runs by hand only.
 */

const image = (name: string): ContentPart => ({
  type: "image_url",
  image_url: { url: `data:image/png;base64,${readFileSync(new URL(`./photos/${name}.png`, import.meta.url)).toString("base64")}` },
});

async function read(title: string, names: string[]): Promise<{ result: ListingPhotosResult; tokens: number }> {
  const reply = await chatJson({
    tier: "vision",
    system: LISTING_PHOTOS_SYSTEM,
    user: [{ type: "text", text: `Listing: ${title}. ${names.length} photo(s) follow, numbered 1 to ${names.length}.` }, ...names.map(image)],
    maxTokens: LISTING_PHOTOS_MAX_TOKENS,
  });
  if (!reply.ok) throw new Error(`AI call failed: ${reply.error} ${reply.detail ?? ""}`);
  return { result: validateListingPhotos(reply.json, names.length), tokens: (reply.usage.inputTokens ?? 0) + (reply.usage.outputTokens ?? 0) };
}

describe("listing photo reading", () => {
  it("reads garment charts and tags, and rejects body-size guides", async () => {
    expect(aiEnabled(), "Set AI_ENABLED=true and DEEPSEEK_API_KEY in .env.local").toBe(true);
    const [chart, body, tag, both] = await Promise.all([
      read("Heavyweight tee", ["garment-chart"]),
      read("Heavyweight tee", ["body-guide"]),
      read("Cotton tee", ["size-tag"]),
      read("Cotton tee", ["size-tag", "garment-chart"]),
    ]);
    const lines = [
      `Model ${modelFor("vision")}, ${new Date().toISOString()}`,
      `garment chart: ${JSON.stringify(chart.result.chart)} rejected=${JSON.stringify(chart.result.rejected)}`,
      `body guide: chart=${JSON.stringify(body.result.chart)} rejected=${JSON.stringify(body.result.rejected)}`,
      `size tag: size=${tag.result.sizeLabel} measurements=${JSON.stringify(tag.result.measurements)} kinds=${tag.result.kinds}`,
      `tag + chart: size=${both.result.sizeLabel} row=${JSON.stringify(both.result.chart && chartRowMeasurements(both.result.chart, both.result.sizeLabel))}`,
      `tokens: ${chart.tokens + body.tokens + tag.tokens + both.tokens}`,
    ];
    writeFileSync(new URL("./last-run-photos.txt", import.meta.url), `${lines.join("\n")}\n`);
    console.log(`\n${lines.join("\n")}`);

    expect(chart.result.chart?.chestBasis).toBe("flat");
    expect(chart.result.chart?.rows.map((r) => [r.label, r.chest_cm, r.length_cm])).toEqual([
      ["S", 51, 68],
      ["M", 54, 70],
      ["L", 57, 72],
      ["XL", 60, 74],
    ]);
    expect(body.result.chart).toBeNull();
    expect(tag.result.sizeLabel).toBe("M");
    expect(tag.result.measurements).toEqual({});
    expect(both.result.chart && chartRowMeasurements(both.result.chart, both.result.sizeLabel)?.chest?.cm).toBe(54);
  });
});
