"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/auth";
import {
  BODY_FIELDS,
  CONSENT_POLICY_VERSION,
  GARMENT_CATEGORIES,
  MANUAL_CONFIDENCE,
  MANUAL_RANGE_CM,
} from "@/lib/passport/fields";
import {
  echo,
  isUuid,
  parseBodyForm,
  parseGarmentForm,
  parsePreferencesForm,
  type FieldErrors,
} from "@/lib/passport/parse";
import { requestRegion } from "@/lib/request-region";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Fit Passport mutations. Server Actions are public endpoints, so each one checks
 * the caller itself: the user id always comes from the session, never the form, and
 * every write is limited to the caller's own rows (by RLS and by an explicit filter).
 * Form actions return only messages and the values as typed, never database rows.
 */

export type FormState = { errors: FieldErrors; values: Record<string, string> } | null;

async function session(returnTo: string) {
  const user = await getUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return { user, supabase };
}

/** For actions without a form to report back to: log the detail, fail loudly. */
function fail(what: string, error: { message: string }): never {
  console.error(`Fit Passport: couldn't ${what}`, error.message);
  throw new Error(`Couldn't ${what}. Please try again.`);
}

const SAVE_FAILED = "Couldn't save. Please try again.";

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export async function grantConsent(formData: FormData) {
  const { user, supabase } = await session("/passport/consent");
  const next = safeNext(String(formData.get("next") ?? ""), "/passport/measure");
  const { error } = await supabase.from("consents").insert({
    user_id: user.id,
    scope: "data",
    action: "granted",
    policy_version: CONSENT_POLICY_VERSION,
    region: await requestRegion(),
  });
  if (error) fail("record your consent", error);
  redirect(next);
}

/**
 * Withdrawing consent deletes the body measurements it covered. They're deleted
 * first, so a failure can never leave measurements behind under a withdrawn consent.
 */
export async function withdrawConsent() {
  const { user, supabase } = await session("/settings");
  const removed = await supabase.from("body_measurements").delete().eq("user_id", user.id);
  if (removed.error) fail("delete your body measurements", removed.error);
  const { error } = await supabase.from("consents").insert({
    user_id: user.id,
    scope: "data",
    action: "withdrawn",
    policy_version: CONSENT_POLICY_VERSION,
    region: await requestRegion(),
  });
  if (error) fail("record that you withdrew consent", error);
  redirect("/settings?consent=withdrawn");
}

// ---------------------------------------------------------------------------
// Body measurements
// ---------------------------------------------------------------------------

const BODY_NAMES = ["unit", ...BODY_FIELDS.map((f) => f.name)];

/** Saves the measurements entered; a field left blank removes that measurement. */
export async function saveMeasurements(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, supabase } = await session("/passport/measure");
  const values = echo(formData, BODY_NAMES);
  const parsed = parseBodyForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values };

  // The database enforces this too; checking first gives a useful redirect instead of an error.
  const consent = await supabase.rpc("has_current_consent", { p_scope: "data" });
  if (consent.error) return { errors: { form: SAVE_FAILED }, values };
  if (!consent.data) redirect("/passport/consent?next=/passport/measure");

  const rows = Object.entries(parsed.value).map(([name, value_cm]) => ({
    user_id: user.id,
    name,
    value_cm,
    range_cm: MANUAL_RANGE_CM,
    confidence: MANUAL_CONFIDENCE,
    source: "manual",
    vendor_job_id: null,
  }));
  const saved = await supabase.from("body_measurements").upsert(rows, { onConflict: "user_id,name" });
  if (saved.error) return { errors: { form: SAVE_FAILED }, values };

  const cleared = BODY_FIELDS.map((f) => f.name).filter((name) => !(name in parsed.value));
  if (cleared.length) {
    const removed = await supabase.from("body_measurements").delete().eq("user_id", user.id).in("name", cleared);
    if (removed.error) return { errors: { form: SAVE_FAILED }, values };
  }
  redirect("/passport?saved=measurements");
}

// ---------------------------------------------------------------------------
// Reference garments
// ---------------------------------------------------------------------------

const GARMENT_NAMES = [
  "id",
  "title",
  "category",
  "sizeLabel",
  "unit",
  "chest",
  "chestBasis",
  "shoulder",
  "length",
  "sleeve",
  "stretch",
  "fitZone",
];

/** Creates a reference garment, or updates one when the form carries its id. */
export async function saveReference(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, supabase } = await session("/passport/garments/new");
  const values = echo(formData, GARMENT_NAMES);
  const id = values.id || null;
  if (id !== null && !isUuid(id)) return { errors: { form: "That garment couldn't be found." }, values };

  const parsed = parseGarmentForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const g = parsed.value;
  const row = {
    title: g.title,
    category: g.category,
    size_label: g.sizeLabel,
    chest_cm: g.chestCm,
    chest_basis: g.chestBasis,
    shoulder_cm: g.shoulderCm,
    length_cm: g.lengthCm,
    sleeve_cm: g.sleeveCm,
    stretch: g.stretch,
    fit_zone: g.fitZone,
  };

  if (id) {
    const { data, error } = await supabase
      .from("reference_garments")
      .update(row)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (error) return { errors: { form: SAVE_FAILED }, values };
    if (data.length === 0) return { errors: { form: "That garment no longer exists." }, values };
  } else {
    const { error } = await supabase.from("reference_garments").insert({ ...row, user_id: user.id });
    if (error) return { errors: { form: SAVE_FAILED }, values };
  }
  redirect("/passport?saved=garment");
}

export async function deleteReference(formData: FormData) {
  const { user, supabase } = await session("/passport");
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/passport");
  const { error } = await supabase.from("reference_garments").delete().eq("id", id).eq("user_id", user.id);
  if (error) fail("delete the garment", error);
  redirect("/passport?saved=deleted");
}

// ---------------------------------------------------------------------------
// Fit preferences
// ---------------------------------------------------------------------------

/** Saves a note per category; a note left blank is removed. */
export async function savePreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, supabase } = await session("/passport/preferences");
  const values = echo(
    formData,
    GARMENT_CATEGORIES.map((c) => c.value),
  );
  const parsed = parsePreferencesForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const rows = Object.entries(parsed.value).map(([category, text]) => ({ user_id: user.id, category, text }));
  if (rows.length) {
    const saved = await supabase.from("fit_preferences").upsert(rows, { onConflict: "user_id,category" });
    if (saved.error) return { errors: { form: SAVE_FAILED }, values };
  }
  const cleared = GARMENT_CATEGORIES.map((c) => c.value).filter((c) => !(c in parsed.value));
  if (cleared.length) {
    const removed = await supabase.from("fit_preferences").delete().eq("user_id", user.id).in("category", cleared);
    if (removed.error) return { errors: { form: SAVE_FAILED }, values };
  }
  redirect("/passport?saved=preferences");
}
