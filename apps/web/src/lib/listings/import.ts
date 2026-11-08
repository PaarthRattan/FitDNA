import "server-only";
import { createHash } from "node:crypto";
import { aiEnabled, chatJson, modelFor } from "@/lib/ai/client";
import { runOnce } from "@/lib/ai/runs";
import {
  LISTING_TEXT_MAX_TOKENS,
  LISTING_TEXT_PROMPT_VERSION,
  LISTING_TEXT_SYSTEM,
  LISTING_TEXT_TASK,
  aiConfidence,
  crossCheck,
  listingTextUserMessage,
  prepareListingText,
  validateListingText,
} from "@/lib/ai/tasks/listing-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPORT_AI_START_BY_MS, LISTING_CACHE_HOURS, LISTING_RETENTION_DAYS } from "./constants";
import {
  EXTRACTOR_VERSION,
  extractListing,
  extractionConfidence,
  type ListingExtraction,
} from "./extract-measurements";
import { scrapeListing, type ScrapeError } from "./firecrawl";
import { readPageFacts } from "./metadata";

/**
 * Runs one listing import, after the request that started it has been answered
 * (see `after()` in src/app/listings/actions.ts). Uses the secret-key client, because
 * listings are shared rows no user may write; the caller has already checked the
 * user and their daily cap.
 *
 * The page text is processed in memory and never stored: only the extracted fields,
 * a hash of the text, and the page's title, price and image URLs are kept. When the
 * regex pass reads fewer than four measurements, the text (and only the text) is also
 * read by an AI model; see src/lib/ai/tasks/listing-text.ts.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

const HOUR_MS = 3600 * 1000;

export function isFresh(fetchedAt: string | null, now = Date.now()): boolean {
  return fetchedAt !== null && now - Date.parse(fetchedAt) < LISTING_CACHE_HOURS * HOUR_MS;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function finish(admin: Admin, importId: string, error: ScrapeError | null) {
  const { error: dbError } = await admin
    .from("listing_imports")
    .update(error ? { status: "failed", error_code: error } : { status: "done", error_code: null })
    .eq("id", importId);
  if (dbError) console.error("Listing import: couldn't record the outcome", importId, dbError.message);
}

export async function runImport(importId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await importListing(admin, importId);
  } catch (error) {
    console.error("Listing import failed", importId, error instanceof Error ? error.message : error);
    await finish(admin, importId, "failed");
  }
}

/**
 * The AI reading, when the regex pass missed something. Skipped when the page is
 * unchanged since the last AI reading, and an identical input is never sent twice
 * (`runOnce`). Any failure just means no AI reading: the regex one and the manual
 * form still work.
 */
async function readWithAi(
  admin: Admin,
  listingId: string,
  hash: string,
  input: { title: string | null; markdown: string; description: string | null },
  regex: ListingExtraction,
): Promise<{ sizeLabel: string | null; condition: ListingExtraction["condition"] } | null> {
  if (!aiEnabled() || Object.keys(regex.measurements).length >= 4) return null;
  const model = modelFor("text");
  const version = `${model}:${LISTING_TEXT_PROMPT_VERSION}`;
  const { data: previous } = await admin
    .from("listing_extractions")
    .select("content_hash, extractor_version")
    .eq("listing_id", listingId)
    .eq("source", "ai_text")
    .maybeSingle();
  if (previous?.content_hash === hash && previous.extractor_version === version) return null;

  const text = prepareListingText(input);
  const run = await runOnce(admin, { task: LISTING_TEXT_TASK, model, promptVersion: LISTING_TEXT_PROMPT_VERSION, input: text }, () =>
    chatJson({ tier: "text", system: LISTING_TEXT_SYSTEM, user: listingTextUserMessage(text), maxTokens: LISTING_TEXT_MAX_TOKENS }),
  );
  if (!run.ok) return null;

  const read = validateListingText(run.output, text);
  const { kept, disagreements } = crossCheck(read.measurements, regex.measurements);
  const saved = await admin.from("listing_extractions").upsert(
    {
      listing_id: listingId,
      source: "ai_text",
      fields: JSON.parse(
        JSON.stringify({
          measurements: kept,
          conflicting: [],
          category: read.category,
          sizeLabel: read.sizeLabel,
          condition: read.condition,
          rejected: read.rejected,
          disagreements,
        }),
      ),
      confidence: aiConfidence(kept),
      extractor_version: version,
      content_hash: hash,
    },
    { onConflict: "listing_id,source" },
  );
  if (saved.error) console.error("Listing import: couldn't save the AI reading", listingId, saved.error.message);
  return { sizeLabel: read.sizeLabel, condition: read.condition };
}

async function importListing(admin: Admin, importId: string) {
  const started = Date.now();
  const { data: job, error } = await admin
    .from("listing_imports")
    .select("id, listing_id, listings (id, canonical_url, title, fetched_at, content_hash)")
    .eq("id", importId)
    .single();
  if (error || !job?.listings) throw new Error(`import not found: ${error?.message ?? "no listing"}`);
  const listing = job.listings;

  // Fetched recently, by this user or anyone: reuse it rather than spend a credit.
  if (isFresh(listing.fetched_at)) return finish(admin, importId, null);

  await admin.from("listing_imports").update({ status: "fetching" }).eq("id", importId);
  const page = await scrapeListing(listing.canonical_url);
  if (!page.ok) return finish(admin, importId, page.error);

  const facts = readPageFacts(page.metadata, page.images);
  const title = facts.title ?? listing.title;
  const extraction = extractListing({ title, markdown: page.markdown, description: facts.description });
  const hash = sha256(page.markdown + (facts.description ?? ""));
  const ai =
    Date.now() - started < IMPORT_AI_START_BY_MS
      ? await readWithAi(admin, listing.id, hash, { title, markdown: page.markdown, description: facts.description }, extraction)
      : null;
  const now = new Date();

  const updated = await admin
    .from("listings")
    .update({
      title,
      price: facts.price,
      currency: facts.currency,
      size_label: extraction.sizeLabel ?? ai?.sizeLabel ?? null,
      condition: extraction.condition ?? facts.condition ?? ai?.condition ?? null,
      image_urls: facts.imageUrls,
      content_hash: hash,
      fetched_at: now.toISOString(),
      retention_until: new Date(now.getTime() + LISTING_RETENTION_DAYS * 24 * HOUR_MS).toISOString(),
    })
    .eq("id", listing.id);
  if (updated.error) throw new Error(`couldn't update the listing: ${updated.error.message}`);

  // Re-read only when the page or the extractor changed since the last read.
  const { data: previous } = await admin
    .from("listing_extractions")
    .select("content_hash, extractor_version")
    .eq("listing_id", listing.id)
    .eq("source", "seller")
    .maybeSingle();
  if (previous?.content_hash !== hash || previous?.extractor_version !== EXTRACTOR_VERSION) {
    const saved = await admin.from("listing_extractions").upsert(
      {
        listing_id: listing.id,
        source: "seller",
        fields: JSON.parse(JSON.stringify(extraction)),
        confidence: extractionConfidence(extraction),
        extractor_version: EXTRACTOR_VERSION,
        content_hash: hash,
      },
      { onConflict: "listing_id,source" },
    );
    if (saved.error) throw new Error(`couldn't save the extraction: ${saved.error.message}`);
  }

  if (facts.price !== null && facts.currency !== null) {
    const observed = await admin
      .from("price_observations")
      .insert({ listing_id: listing.id, price: facts.price, currency: facts.currency });
    if (observed.error) console.error("Listing import: couldn't record the price", importId, observed.error.message);
  }

  await finish(admin, importId, null);
}
