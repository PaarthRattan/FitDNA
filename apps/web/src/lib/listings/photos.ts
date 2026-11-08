import "server-only";
import { createHash } from "node:crypto";
import { aiEnabled, chatJson, modelFor, type ContentPart } from "@/lib/ai/client";
import { runOnce } from "@/lib/ai/runs";
import {
  LISTING_PHOTOS_MAX_IMAGES,
  LISTING_PHOTOS_MAX_TOKENS,
  LISTING_PHOTOS_PROMPT_VERSION,
  LISTING_PHOTOS_SYSTEM,
  LISTING_PHOTOS_TASK,
  chartRowMeasurements,
} from "@/lib/ai/tasks/listing-photos";
import { validateListingPhotos } from "@/lib/ai/tasks/listing-photos";
import { aiConfidence, crossCheck } from "@/lib/ai/tasks/listing-text";
import type { createAdminClient } from "@/lib/supabase/admin";
import { listingBaseline } from "./fit";
import { fetchListingImage } from "./image-fetch";
import type { Marketplace } from "./url";

/**
 * Reads a listing's photos: fetches up to four into memory, asks the vision model,
 * validates the reply, and stores what survives as an `ai_photo` reading (plus a size
 * chart, if one is legible). The photos are never stored or logged; ai_runs keeps
 * only hashes. Runs automatically when the text gave no measurements at all, and
 * when a user asks. A given set of photos is read once.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type PhotoOutcome = "read" | "nothing" | "no_photos" | "failed" | "disabled" | "already";

export interface PhotoListing {
  id: string;
  marketplace: Marketplace;
  title: string | null;
  size_label: string | null;
  image_urls: string[];
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export async function readListingPhotos(admin: Admin, listing: PhotoListing): Promise<PhotoOutcome> {
  if (!aiEnabled()) return "disabled";
  const urls = listing.image_urls.slice(0, LISTING_PHOTOS_MAX_IMAGES);
  if (urls.length === 0) return "no_photos";
  const images = (await Promise.all(urls.map((u) => fetchListingImage(listing.marketplace, u)))).filter((i) => i !== null);
  if (images.length === 0) return "no_photos";

  const photoSet = sha256(images.map((i) => i.sha256).join(","));
  const model = modelFor("vision");
  const version = `${model}:${LISTING_PHOTOS_PROMPT_VERSION}`;
  const { data: previous } = await admin
    .from("listing_extractions")
    .select("content_hash, extractor_version")
    .eq("listing_id", listing.id)
    .eq("source", "ai_photo")
    .maybeSingle();
  if (previous?.content_hash === photoSet && previous.extractor_version === version) return "already";

  const title = (listing.title ?? "").slice(0, 200);
  const parts: ContentPart[] = [
    { type: "text", text: `Listing: ${title || "untitled"}. ${images.length} photo(s) follow, numbered 1 to ${images.length}.` },
    ...images.map((i): ContentPart => ({ type: "image_url", image_url: { url: `data:${i.type};base64,${i.base64}` } })),
  ];
  const run = await runOnce(
    admin,
    { task: LISTING_PHOTOS_TASK, model, promptVersion: LISTING_PHOTOS_PROMPT_VERSION, input: `${title}\n${photoSet}` },
    () => chatJson({ tier: "vision", system: LISTING_PHOTOS_SYSTEM, user: parts, maxTokens: LISTING_PHOTOS_MAX_TOKENS }),
  );
  if (!run.ok) return "failed";

  const read = validateListingPhotos(run.output, images.length);
  // The chart row for this listing's size counts as its measurements; a tape reading wins over it.
  const fromChart = read.chart ? (chartRowMeasurements(read.chart, listing.size_label ?? read.sizeLabel) ?? {}) : {};
  const { data: textRows } = await admin
    .from("listing_extractions")
    .select("source, fields")
    .eq("listing_id", listing.id)
    .in("source", ["seller", "ai_text"]);
  const { kept, disagreements } = crossCheck({ ...fromChart, ...read.measurements }, listingBaseline(textRows ?? []).measurements);

  const saved = await admin.from("listing_extractions").upsert(
    {
      listing_id: listing.id,
      source: "ai_photo",
      fields: JSON.parse(
        JSON.stringify({
          measurements: kept,
          conflicting: [],
          category: null,
          sizeLabel: read.sizeLabel,
          condition: null,
          photos: read.kinds,
          rejected: read.rejected,
          disagreements,
        }),
      ),
      confidence: Math.max(0, aiConfidence(kept) - 0.2),
      extractor_version: version,
      content_hash: photoSet,
    },
    { onConflict: "listing_id,source" },
  );
  if (saved.error) {
    console.error("Photo reading: couldn't save", listing.id, saved.error.message);
    return "failed";
  }
  if (read.chart) {
    const chart = await admin.from("size_charts").upsert(
      {
        listing_id: listing.id,
        brand: read.chart.brand,
        chest_basis: read.chart.chestBasis,
        rows: JSON.parse(JSON.stringify(read.chart.rows)),
        source: "ai_photo",
        extractor_version: version,
      },
      { onConflict: "listing_id" },
    );
    if (chart.error) console.error("Photo reading: couldn't save the size chart", listing.id, chart.error.message);
  }
  if (!listing.size_label && read.sizeLabel) {
    await admin.from("listings").update({ size_label: read.sizeLabel }).eq("id", listing.id);
  }
  return Object.keys(kept).length > 0 || read.chart ? "read" : "nothing";
}
