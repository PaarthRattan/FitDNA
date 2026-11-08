"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { getUser } from "@/lib/db/auth";
import { loadListing } from "@/lib/db/listings";
import { IMPORT_DAILY_CAP } from "@/lib/listings/constants";
import { overrideFromForm } from "@/lib/listings/fit";
import { runImport } from "@/lib/listings/import";
import { LISTING_FORM_FIELDS, parseListingForm } from "@/lib/listings/parse";
import { parseListingUrl } from "@/lib/listings/url";
import { echo, isUuid, type FieldErrors } from "@/lib/passport/parse";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Listing mutations. Server Actions are public endpoints, so each one checks the
 * caller itself: the user id comes only from the session, and every listing id from
 * a form is re-checked against what that user may see. The secret-key client is used
 * only to write shared listing rows, and only after the user and their daily cap are
 * checked.
 */

export type FormState = { errors: FieldErrors; values: Record<string, string> } | null;

async function session(returnTo: string) {
  const user = await getUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return { user, supabase };
}

function fail(what: string, error: { message: string }): never {
  console.error(`Listings: couldn't ${what}`, error.message);
  throw new Error(`Couldn't ${what}. Please try again.`);
}

const DAY_MS = 24 * 3600 * 1000;
const START_FAILED = "Couldn't start the import. Please try again.";

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Starts importing a pasted link and returns straight away: the page is fetched and
 * read after the response (`after`), and the page polls for the outcome. The
 * listing row exists before the fetch, so a site that blocks it can still be filled
 * in by hand. Runs within /listings/new's `maxDuration`.
 */
export async function startImport(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, supabase } = await session("/listings/new");
  const values = echo(formData, ["url"]);
  const parsed = parseListingUrl(values.url);
  if (!parsed.ok) return { errors: { url: parsed.message }, values };

  const recent = await supabase
    .from("listing_imports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  if (recent.error) return { errors: { form: START_FAILED }, values };
  if ((recent.count ?? 0) >= IMPORT_DAILY_CAP) {
    return { errors: { url: `That's ${IMPORT_DAILY_CAP} links in the last 24 hours, today's limit. Try again tomorrow.` }, values };
  }

  const admin = createAdminClient();
  if (!admin) return { errors: { form: "Importing isn't set up on this server yet." }, values };

  const created = await admin
    .from("listings")
    .upsert({ marketplace: parsed.marketplace, canonical_url: parsed.canonicalUrl }, { onConflict: "canonical_url", ignoreDuplicates: true });
  const listing = created.error
    ? created
    : await admin.from("listings").select("id").eq("canonical_url", parsed.canonicalUrl).single();
  if (listing.error || !listing.data) {
    console.error("Listings: couldn't create the listing", listing.error?.message);
    return { errors: { form: START_FAILED }, values };
  }

  const job = await admin.from("listing_imports").insert({ user_id: user.id, listing_id: listing.data.id }).select("id").single();
  if (job.error) {
    console.error("Listings: couldn't create the import", job.error.message);
    return { errors: { form: START_FAILED }, values };
  }
  const importId = job.data.id;
  after(() => runImport(importId));
  redirect(`/listings/new?import=${importId}`);
}

// ---------------------------------------------------------------------------
// Confirm / correct a listing's numbers
// ---------------------------------------------------------------------------

/** Saves the user's own view of a listing. Only what differs from the listing is stored. */
export async function saveListingFit(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = echo(formData, LISTING_FORM_FIELDS);
  const id = values.id;
  const { user, supabase } = await session(isUuid(id) ? `/listings/${id}/edit` : "/search");
  if (!isUuid(id)) return { errors: { form: "That listing couldn't be found." }, values };

  const parsed = parseListingForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const listing = await loadListing(id);
  if (!listing?.signedIn) return { errors: { form: "That listing couldn't be found." }, values };

  const row = overrideFromForm(parsed.value, listing.baseline.measurements, listing.own);
  const { error } = await supabase
    .from("listing_overrides")
    .upsert({ ...row, user_id: user.id, listing_id: id }, { onConflict: "user_id,listing_id" });
  if (error) {
    console.error("Listings: couldn't save corrections", error.message);
    return { errors: { form: "Couldn't save. Please try again." }, values };
  }
  redirect(`/search/${id}?saved=fit`);
}

// ---------------------------------------------------------------------------
// Save, unsave, bought
// ---------------------------------------------------------------------------

async function visibleListing(formData: FormData) {
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/search");
  const { user, supabase } = await session(`/search/${id}`);
  const listing = await loadListing(id);
  if (!listing?.signedIn) redirect("/search");
  return { id, user, supabase, listing };
}

export async function saveListing(formData: FormData) {
  const { id, user, supabase } = await visibleListing(formData);
  const { error } = await supabase
    .from("saved_listings")
    .upsert({ user_id: user.id, listing_id: id }, { onConflict: "user_id,listing_id", ignoreDuplicates: true });
  if (error) fail("save the listing", error);
  redirect(`/search/${id}?saved=listing`);
}

export async function unsaveListing(formData: FormData) {
  const { id, user, supabase } = await visibleListing(formData);
  const { error } = await supabase.from("saved_listings").delete().eq("user_id", user.id).eq("listing_id", id);
  if (error) fail("remove the listing from Saved", error);
  redirect(`/search/${id}`);
}

/**
 * "I bought this": records the prediction as it stands now, so the fit check after
 * delivery (M7) can be compared with what was predicted. The snapshot holds zones
 * and differences in cm, and a fingerprint of the inputs, never body measurements.
 */
export async function markBought(formData: FormData) {
  const { id, user, supabase, listing } = await visibleListing(formData);
  const { summary, inputsHash } = listing;
  const prediction = summary.fit?.prediction;
  const category = summary.effective.category;
  // Demo listings can't be bought; their outcomes would pollute calibration data.
  if (summary.isDemo || !prediction || !category || !inputsHash) redirect(`/search/${id}`);

  const { error } = await supabase.from("purchases").upsert(
    {
      user_id: user.id,
      listing_id: id,
      marketplace: summary.marketplace,
      listing_title: summary.effective.title,
      listing_url: summary.url,
      category,
      size_label: summary.effective.sizeLabel,
      prediction: JSON.parse(JSON.stringify(prediction)),
      engine_version: prediction.engineVersion,
      inputs_hash: inputsHash,
    },
    { onConflict: "user_id,listing_id", ignoreDuplicates: true },
  );
  if (error) fail("record the purchase", error);
  redirect(`/search/${id}?saved=bought`);
}

export async function undoBought(formData: FormData) {
  const { id, user, supabase } = await visibleListing(formData);
  const { error } = await supabase.from("purchases").delete().eq("user_id", user.id).eq("listing_id", id);
  if (error) fail("undo the purchase", error);
  redirect(`/search/${id}`);
}
