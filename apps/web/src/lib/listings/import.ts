import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { LISTING_CACHE_HOURS, LISTING_RETENTION_DAYS } from "./constants";
import { EXTRACTOR_VERSION, extractListing, extractionConfidence } from "./extract-measurements";
import { scrapeListing, type ScrapeError } from "./firecrawl";
import { readPageFacts } from "./metadata";

/**
 * Runs one listing import, after the request that started it has been answered
 * (see `after()` in src/app/listings/actions.ts). Uses the secret-key client, because
 * listings are shared rows no user may write; the caller has already checked the
 * user and their daily cap.
 *
 * The page text is processed in memory and never stored: only the extracted fields,
 * a hash of the text, and the page's title, price and image URLs are kept.
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

async function importListing(admin: Admin, importId: string) {
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
  const extraction = extractListing({ title, markdown: page.markdown });
  const hash = sha256(page.markdown);
  const now = new Date();

  const updated = await admin
    .from("listings")
    .update({
      title,
      price: facts.price,
      currency: facts.currency,
      size_label: extraction.sizeLabel,
      condition: extraction.condition,
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
