import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { ENGINE_VERSION } from "@/lib/fit/constants";
import type { PhotoChart } from "@/lib/ai/tasks/listing-photos";
import type { SizeRecommendation } from "@/lib/fit/types";
import { FIT_ZONE_ORDER, type FitZone } from "@/lib/fit-zones";
import {
  effectiveListing,
  listingBaseline,
  listingFit,
  readStoredChart,
  sizeRecommendation,
  type EffectiveListing,
  type FitContext,
  type ListingFit,
} from "@/lib/listings/fit";
import { importState, type ImportState } from "@/lib/listings/status";
import { toBodyMeasurements, toReferenceGarment } from "@/lib/passport/mappers";
import { isUuid } from "@/lib/passport/parse";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { getUser } from "./auth";
import { check, signedIn } from "./query";

/**
 * Reads for listings. Listings are shared rows: row-level security shows each user
 * only the listings they imported, plus demo ones, and these functions also check
 * that link explicitly. The user's own rows (overrides, saves, purchases, passport)
 * are filtered by their id. Predictions are computed here on every read, never
 * stored, so they always reflect the current passport.
 */

type Client = SupabaseClient<Database>;
type OverrideRow = Database["public"]["Tables"]["listing_overrides"]["Row"];

const LISTING_COLUMNS =
  "id, marketplace, canonical_url, title, price, currency, size_label, condition, seller_rating, image_urls, is_demo, fetched_at, created_at, listing_extractions (source, fields)" as const;

/** The most recent imports a list shows. */
const MAX_LISTINGS = 200;

export interface ListingSummary {
  id: string;
  marketplace: string;
  /** The listing on its marketplace; null for demo listings. */
  url: string | null;
  price: number | null;
  currency: string | null;
  sellerRating: number | null;
  isDemo: boolean;
  /** False when the page couldn't be read and everything came from the user. */
  fetched: boolean;
  effective: EffectiveListing;
  /** Null when signed out. */
  fit: ListingFit | null;
  saved: boolean;
  purchased: boolean;
  /** The user's purchase of it, and how they said it fit (M7), when they did. */
  purchaseId: string | null;
  outcome: FitZone | null;
}

interface UserState {
  overrides: Map<string, OverrideRow>;
  saved: Map<string, string>;
  purchased: Map<string, { at: string; id: string; outcome: FitZone | null }>;
  context: FitContext;
  /** Which inputs a prediction used, by identity and edit time, never by value. */
  versions: { body: Array<[string, string]>; references: Array<[string, string]> };
}

async function loadUserState(supabase: Client, userId: string): Promise<UserState> {
  const [overrides, saved, purchases, body, references] = await Promise.all([
    supabase.from("listing_overrides").select("*").eq("user_id", userId),
    supabase.from("saved_listings").select("listing_id, created_at").eq("user_id", userId),
    supabase.from("purchases").select("id, listing_id, purchased_at, fit_feedback (overall)").eq("user_id", userId),
    supabase.from("body_measurements").select("name, value_cm, confidence, updated_at").eq("user_id", userId),
    supabase.from("reference_garments").select("*").eq("user_id", userId).order("created_at"),
  ]);
  const bodyRows = check(body, "body measurements");
  const referenceRows = check(references, "reference garments");
  return {
    overrides: new Map(check(overrides, "your corrections").map((o) => [o.listing_id, o])),
    saved: new Map(check(saved, "saved listings").map((s) => [s.listing_id, s.created_at])),
    purchased: new Map(
      check(purchases, "purchases").flatMap((p) =>
        p.listing_id
          ? [[p.listing_id, { at: p.purchased_at, id: p.id, outcome: FIT_ZONE_ORDER.find((z) => z === p.fit_feedback?.overall) ?? null }] as const]
          : [],
      ),
    ),
    context: { body: toBodyMeasurements(bodyRows), references: referenceRows.map(toReferenceGarment) },
    versions: {
      body: bodyRows.map((r) => [r.name, r.updated_at]),
      references: referenceRows.map((r) => [r.id, r.updated_at]),
    },
  };
}

type ListingRow = NonNullable<Awaited<ReturnType<typeof selectListings>>["data"]>[number];

function selectListings(supabase: Client) {
  return supabase.from("listings").select(LISTING_COLUMNS);
}

function summarise(row: ListingRow, user: UserState | null): ListingSummary {
  const effective = effectiveListing(row, row.listing_extractions, user?.overrides.get(row.id) ?? null);
  return {
    id: row.id,
    marketplace: row.marketplace,
    url: row.is_demo ? null : row.canonical_url,
    price: row.price,
    currency: row.currency,
    sellerRating: row.seller_rating,
    isDemo: row.is_demo,
    fetched: row.fetched_at !== null,
    effective,
    fit: user ? listingFit(effective, row.seller_rating, user.context) : null,
    saved: user?.saved.has(row.id) ?? false,
    purchased: user?.purchased.has(row.id) ?? false,
    purchaseId: user?.purchased.get(row.id)?.id ?? null,
    outcome: user?.purchased.get(row.id)?.outcome ?? null,
  };
}

/** Highest score first; listings that can't be scored yet after, newest first. */
function byScore(a: ListingSummary, b: ListingSummary): number {
  return (b.fit?.score?.score ?? -1) - (a.fit?.score?.score ?? -1);
}

async function listingsByIds(supabase: Client, ids: string[]): Promise<ListingRow[]> {
  if (ids.length === 0) return [];
  return check(await selectListings(supabase).in("id", ids), "listings");
}

async function importedIds(supabase: Client, userId: string): Promise<string[]> {
  const rows = check(
    await supabase
      .from("listing_imports")
      .select("listing_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_LISTINGS),
    "your imports",
  );
  return [...new Set(rows.map((r) => r.listing_id))];
}

export interface SearchListings {
  configured: boolean;
  signedIn: boolean;
  /** The user's own imports, or demo listings while they have none. */
  listings: ListingSummary[];
  showingDemo: boolean;
}

export async function loadSearchListings(): Promise<SearchListings> {
  const supabase = await createClient();
  if (!supabase) return { configured: false, signedIn: false, listings: [], showingDemo: false };
  const user = await getUser();
  const demo = async () => check(await selectListings(supabase).eq("is_demo", true).order("created_at"), "demo listings");

  if (!user) {
    return { configured: true, signedIn: false, listings: (await demo()).map((r) => summarise(r, null)), showingDemo: true };
  }
  const [ids, state] = await Promise.all([importedIds(supabase, user.id), loadUserState(supabase, user.id)]);
  const order = new Map(ids.map((id, i) => [id, i]));
  const mine = (await listingsByIds(supabase, ids))
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((r) => summarise(r, state))
    .sort(byScore);
  if (mine.length > 0) return { configured: true, signedIn: true, listings: mine, showingDemo: false };
  return { configured: true, signedIn: true, listings: (await demo()).map((r) => summarise(r, state)).sort(byScore), showingDemo: true };
}

/** Saved listings, most recently saved first. */
export async function loadSavedListings(): Promise<ListingSummary[]> {
  const { user, supabase } = await signedIn("/saved");
  const state = await loadUserState(supabase, user.id);
  const ids = [...state.saved.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id);
  const rows = new Map((await listingsByIds(supabase, ids)).map((r) => [r.id, r]));
  return ids.flatMap((id) => (rows.has(id) ? [summarise(rows.get(id)!, state)] : []));
}

/** Listings the user saved or bought, most recent first, for the wardrobe. */
export async function loadRecentPredictions(limit = 5): Promise<ListingSummary[]> {
  const { user, supabase } = await signedIn("/");
  const state = await loadUserState(supabase, user.id);
  const latest = new Map<string, string>();
  const actions: Array<[string, string]> = [...state.saved, ...[...state.purchased].map(([id, p]) => [id, p.at] as [string, string])];
  for (const [id, at] of actions) if (!latest.has(id) || at > latest.get(id)!) latest.set(id, at);
  const ids = [...latest.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, limit).map(([id]) => id);
  const rows = new Map((await listingsByIds(supabase, ids)).map((r) => [r.id, r]));
  return ids.flatMap((id) => (rows.has(id) ? [summarise(rows.get(id)!, state)] : []));
}

export interface ListingDetail {
  summary: ListingSummary;
  signedIn: boolean;
  /** For the confirm form: the user's corrections, and what the listing alone says. */
  override: OverrideRow | null;
  baseline: ReturnType<typeof listingBaseline>;
  own: { title: string | null; size_label: string | null };
  /** The listing's own photos (URLs only; never fetched for display), and whether they've been read. */
  photos: string[];
  photosRead: boolean;
  /** A size chart read from the photos, and the size that would fit best (signed in). */
  chart: PhotoChart | null;
  recommendation: SizeRecommendation | null;
  /** Fingerprint of the prediction's inputs, for a purchase snapshot. Null when signed out. */
  inputsHash: string | null;
}

/**
 * One listing, if the user may see it: a demo listing, or one they imported. Signed
 * out, only demo listings, and with no prediction. Null when it doesn't exist or
 * isn't theirs. Cached per request, so a page and its metadata share one load.
 */
export const loadListing = cache(async (id: string): Promise<ListingDetail | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const user = await getUser();
  const row = check(await selectListings(supabase).eq("id", id).limit(1), "the listing")[0];
  if (!row) return null;
  const baseline = listingBaseline(row.listing_extractions);
  const own = { title: row.title, size_label: row.size_label };
  const photos = { photos: row.image_urls, photosRead: row.listing_extractions.some((e) => e.source === "ai_photo") };
  const chart = readStoredChart(
    (await supabase.from("size_charts").select("chest_basis, rows, brand").eq("listing_id", id).maybeSingle()).data,
  );

  if (!user) {
    if (!row.is_demo) return null;
    return { summary: summarise(row, null), signedIn: false, override: null, baseline, own, ...photos, chart, recommendation: null, inputsHash: null };
  }
  if (!row.is_demo) {
    const imported = check(
      await supabase.from("listing_imports").select("id").eq("user_id", user.id).eq("listing_id", id).limit(1),
      "your imports",
    );
    if (imported.length === 0) return null;
  }
  const state = await loadUserState(supabase, user.id);
  const summary = summarise(row, state);
  const inputsHash = createHash("sha256")
    .update(
      JSON.stringify({
        engine: ENGINE_VERSION,
        listing: { id, category: summary.effective.category, stretch: summary.effective.stretch, measurements: summary.effective.measurements },
        ...state.versions,
      }),
    )
    .digest("hex");
  return {
    summary,
    signedIn: true,
    override: state.overrides.get(id) ?? null,
    baseline,
    own,
    ...photos,
    chart,
    recommendation: sizeRecommendation(summary.effective, chart, state.context),
    inputsHash,
  };
});

/** Where one of the user's imports stands, or null if it isn't theirs. */
export async function loadImport(id: string): Promise<ImportState | null> {
  const { user, supabase } = await signedIn("/listings/new");
  if (!isUuid(id)) return null;
  const row = check(
    await supabase
      .from("listing_imports")
      .select("listing_id, status, error_code, updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .limit(1),
    "the import",
  )[0];
  return row ? importState(row) : null;
}
