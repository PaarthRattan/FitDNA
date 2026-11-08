import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiEnabled, chatJson, modelFor } from "@/lib/ai/client";
import {
  LISTING_TEXT_MAX_TOKENS,
  LISTING_TEXT_SYSTEM,
  crossCheck,
  listingTextUserMessage,
  prepareListingText,
  validateListingText,
} from "@/lib/ai/tasks/listing-text";
import type { FitPart } from "@/lib/fit/types";
import { extractListing, type ExtractedMeasurement } from "@/lib/listings/extract-measurements";
import { CASES, type EvalCase } from "./cases";

/*
 * `npm run eval`: scores the regex pass, the AI reading, and the two combined as the
 * import combines them, against evals/listings/cases.ts. Calls the real model, so it
 * costs a little money and runs only by hand, never in CI. Needs AI_ENABLED=true and
 * DEEPSEEK_API_KEY in .env.local.
 */

const PARTS: FitPart[] = ["chest", "shoulder", "length", "sleeve"];
const TOLERANCE_CM = 1;

type Reading = Partial<Record<FitPart, ExtractedMeasurement>>;
type Tally = { correct: number; wrong: number; missed: number; invented: number; basisWrong: number };

const empty = (): Tally => ({ correct: 0, wrong: 0, missed: 0, invented: 0, basisWrong: 0 });

function score(c: EvalCase, got: Reading, tally: Tally, notes: string[]) {
  for (const part of PARTS) {
    const want = c.expected[part];
    const have = got[part];
    if (!want && !have) continue;
    if (!want) {
      tally.invented += 1;
      notes.push(`${part}: invented ${have!.cm}`);
    } else if (!have) {
      tally.missed += 1;
      notes.push(`${part}: missed`);
    } else if (Math.abs(have.cm - want.cm) > TOLERANCE_CM) {
      tally.wrong += 1;
      notes.push(`${part}: ${have.cm} ≠ ${want.cm}`);
    } else if (part === "chest" && want.basis && have.basis !== want.basis) {
      tally.wrong += 1;
      tally.basisWrong += 1;
      notes.push(`chest: ${have.basis} ≠ ${want.basis}`);
    } else {
      tally.correct += 1;
    }
  }
}

const rate = (t: Tally) => {
  const found = t.correct + t.wrong + t.invented;
  const expected = t.correct + t.wrong + t.missed;
  const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
  return `${t.correct} right, ${t.wrong} wrong (${t.basisWrong} flat/around), ${t.missed} missed, ${t.invented} invented · precision ${pct(t.correct, found)} · recall ${pct(t.correct, expected)}`;
};

describe("listing text extraction", () => {
  it("scores regex, AI and combined against the cases", async () => {
    expect(aiEnabled(), "Set AI_ENABLED=true and DEEPSEEK_API_KEY in .env.local").toBe(true);
    const tallies = { regex: empty(), ai: empty(), combined: empty() };
    const lines: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const results = await Promise.all(
      CASES.map(async (c) => {
        const description = c.description ?? null;
        const regex = extractListing({ title: c.title, markdown: c.markdown, description }).measurements;
        const text = prepareListingText({ title: c.title, markdown: c.markdown, description });
        const reply = await chatJson({ tier: "text", system: LISTING_TEXT_SYSTEM, user: listingTextUserMessage(text), maxTokens: LISTING_TEXT_MAX_TOKENS });
        const read = reply.ok ? validateListingText(reply.json, text) : null;
        return { c, regex, reply, read };
      }),
    );

    for (const { c, regex, reply, read } of results) {
      inputTokens += reply.usage?.inputTokens ?? 0;
      outputTokens += reply.usage?.outputTokens ?? 0;
      const ai = read?.measurements ?? {};
      // As the import does: AI only when the regex read fewer than four parts, regex first.
      const combined: Reading =
        Object.keys(regex).length >= 4 ? regex : { ...crossCheck(ai, regex).kept, ...regex };
      const notes: Record<string, string[]> = { regex: [], ai: [], combined: [] };
      score(c, regex, tallies.regex, notes.regex);
      score(c, ai, tallies.ai, notes.ai);
      score(c, combined, tallies.combined, notes.combined);
      const status = reply.ok ? "" : ` [AI ${reply.error}${reply.detail ? `: ${reply.detail}` : ""}]`;
      const rejected = read?.rejected.length ? ` [rejected: ${read.rejected.join("; ")}]` : "";
      lines.push(
        `${c.id.padEnd(22)} regex: ${notes.regex.join(", ") || "ok"} | ai: ${notes.ai.join(", ") || "ok"}${status}${rejected} | combined: ${notes.combined.join(", ") || "ok"}`,
      );
    }

    const report = [
        `Model ${modelFor("text")}, ${CASES.length} cases, ±${TOLERANCE_CM} cm, ${new Date().toISOString()}`,
        ...lines,
        "",
        `regex     ${rate(tallies.regex)}`,
        `ai        ${rate(tallies.ai)}`,
        `combined  ${rate(tallies.combined)}`,
        `tokens: ${inputTokens} in, ${outputTokens} out`,
      ].join("\n");
    // Kept out of git: evals/listings/last-run.txt.
    writeFileSync(new URL("./last-run.txt", import.meta.url), `${report}\n`);
    console.log(`\n${report}`);
    // The combination must never be worse than the regex alone at inventing numbers.
    expect(tallies.combined.invented).toBeLessThanOrEqual(tallies.regex.invented);
  });
});
