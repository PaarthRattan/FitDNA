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
import { AVATAR_BUCKET, SCAN_CONSENT_DAILY_GRANTS, avatarPath } from "@/lib/scan/constants";
import { SCAN_CONSENT_POLICY_VERSION } from "@/lib/scan/consent";
import { readStoredResult } from "@/lib/scan/result";
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

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

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
 * Withdrawing consent deletes the body measurements it covered, and everything from
 * photo scans too (they need this consent as well), with the scan consent withdrawn
 * alongside. Data goes first, so a failure can never leave any behind under a
 * withdrawn consent.
 */
export async function withdrawConsent() {
  const { user, supabase } = await session("/settings");
  await removeScanData(supabase, user.id);
  const removed = await supabase.from("body_measurements").delete().eq("user_id", user.id);
  if (removed.error) fail("delete your body measurements", removed.error);
  const region = await requestRegion();
  const { error } = await supabase.from("consents").insert([
    { user_id: user.id, scope: "data", action: "withdrawn", policy_version: CONSENT_POLICY_VERSION, region },
    { user_id: user.id, scope: "scan", action: "withdrawn", policy_version: SCAN_CONSENT_POLICY_VERSION, region },
  ]);
  if (error) fail("record that you withdrew consent", error);
  redirect("/settings?consent=withdrawn");
}

// ---------------------------------------------------------------------------
// Photo scans
// ---------------------------------------------------------------------------

/**
 * Deletes everything photo scans produced for this user: the avatar files (the whole
 * folder, so nothing orphaned survives), the avatar, the scans and any measurement
 * taken from a scan. Storage first: the database can't delete files, and a cascade
 * from the rows would leave them behind.
 */
async function removeScanData(supabase: Supabase, userId: string) {
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  // A page of files at a time; a user has one avatar, plus any a failed clean-up left.
  for (let round = 0; ; round++) {
    const listed = await bucket.list(userId, { limit: 100 });
    if (listed.error) fail("find your avatar files", listed.error);
    const paths = listed.data.filter((f) => f.id !== null).map((f) => `${userId}/${f.name}`);
    if (paths.length === 0) break;
    if (round === 10) fail("delete your avatar files", { message: "files still listed after removal" });
    const removed = await bucket.remove(paths);
    if (removed.error) fail("delete your avatar files", removed.error);
  }
  const avatars = await supabase.from("avatars").delete().eq("user_id", userId);
  if (avatars.error) fail("delete your avatar", avatars.error);
  const scans = await supabase.from("scans").delete().eq("user_id", userId);
  if (scans.error) fail("delete your scans", scans.error);
  const scanned = await supabase.from("body_measurements").delete().eq("user_id", userId).eq("source", "scan");
  if (scanned.error) fail("delete your scanned measurements", scanned.error);
}

/** Records the separate consent photo scans need. Body-data consent comes first. */
export async function grantScanConsent(formData: FormData) {
  const { user, supabase } = await session("/passport/scan/consent");
  if (formData.get("agree") !== "yes") redirect("/passport/scan/consent?missing=agree");
  const data = await supabase.rpc("has_current_consent", { p_scope: "data" });
  if (data.error) fail("check your consent", data.error);
  if (!data.data) redirect("/passport/consent?next=/passport/scan/consent");
  const recent = await supabase
    .from("consents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("scope", "scan")
    .eq("action", "granted")
    .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if (recent.error) fail("check your consent", recent.error);
  if ((recent.count ?? 0) >= SCAN_CONSENT_DAILY_GRANTS) redirect("/passport/scan/consent?missing=later");
  const { error } = await supabase.from("consents").insert({
    user_id: user.id,
    scope: "scan",
    action: "granted",
    policy_version: SCAN_CONSENT_POLICY_VERSION,
    region: await requestRegion(),
  });
  if (error) fail("record your consent", error);
  redirect("/passport/scan");
}

/** Withdrawing scan consent deletes everything scans produced; tape measurements stay. */
export async function withdrawScanConsent() {
  const { user, supabase } = await session("/settings");
  await removeScanData(supabase, user.id);
  const { error } = await supabase.from("consents").insert({
    user_id: user.id,
    scope: "scan",
    action: "withdrawn",
    policy_version: SCAN_CONSENT_POLICY_VERSION,
    region: await requestRegion(),
  });
  if (error) fail("record that you withdrew consent", error);
  redirect("/settings?consent=scan-withdrawn");
}

/**
 * Copies the ticked fields of a finished scan into the passport, marked as scanned,
 * with the scan's own range and (capped) confidence. Nothing is copied unticked.
 */
export async function applyScan(formData: FormData) {
  const id = formData.get("id");
  const { user, supabase } = await session(isUuid(id) ? `/passport/scan/${id}` : "/passport");
  if (!isUuid(id)) redirect("/passport");

  const consents = await Promise.all([
    supabase.rpc("has_current_consent", { p_scope: "scan" }),
    supabase.rpc("has_current_consent", { p_scope: "data" }),
  ]);
  for (const c of consents) if (c.error) fail("check your consent", c.error);
  if (!consents[0].data) redirect("/passport/scan/consent");
  if (!consents[1].data) redirect(`/passport/consent?next=/passport/scan/${id}`);

  const { data: rows, error } = await supabase.from("scans").select("status, result").eq("id", id).eq("user_id", user.id).limit(1);
  if (error) fail("load the scan", error);
  const result = rows[0]?.status === "done" ? readStoredResult(rows[0].result) : null;
  if (!result) redirect(`/passport/scan/${id}`);

  const ticked = new Set(formData.getAll("use").map(String));
  const chosen = BODY_FIELDS.filter((f) => ticked.has(f.name) && result.measurements[f.name]);
  if (chosen.length === 0) redirect("/passport?saved=scan-none");
  const saved = await supabase.from("body_measurements").upsert(
    chosen.map(({ name }) => {
      const m = result.measurements[name]!;
      return {
        user_id: user.id,
        name,
        value_cm: m.value_cm,
        range_cm: m.range_cm,
        confidence: m.confidence,
        source: "scan",
        vendor_job_id: id,
      };
    }),
    { onConflict: "user_id,name" },
  );
  if (saved.error) fail("save the scanned measurements", saved.error);
  redirect("/passport?saved=scan");
}

/**
 * Deletes one scan, and the avatar if it came from this scan. Measurements already
 * copied into the passport stay; the user changes or removes those there.
 */
export async function deleteScan(formData: FormData) {
  const id = formData.get("id");
  const { user, supabase } = await session("/passport");
  if (!isUuid(id)) redirect("/passport");
  const removed = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(user.id, id)]);
  if (removed.error) fail("delete the scan's avatar", removed.error);
  const { error } = await supabase.from("scans").delete().eq("id", id).eq("user_id", user.id);
  if (error) fail("delete the scan", error);
  redirect("/passport?saved=scan-deleted");
}

/** Deletes the avatar and its file. The scan's measurements, and any in the passport, stay. */
export async function deleteAvatar() {
  const { user, supabase } = await session("/passport/avatar");
  const { data, error } = await supabase.from("avatars").select("storage_path").eq("user_id", user.id).limit(1);
  if (error) fail("find your avatar", error);
  if (data[0]) {
    const removed = await supabase.storage.from(AVATAR_BUCKET).remove([data[0].storage_path]);
    if (removed.error) fail("delete your avatar file", removed.error);
  }
  const deleted = await supabase.from("avatars").delete().eq("user_id", user.id);
  if (deleted.error) fail("delete your avatar", deleted.error);
  redirect("/passport?saved=avatar-deleted");
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

  // A value left as it was keeps its source: re-saving the form doesn't turn a scanned
  // value into a "tape" one. Typing a different number replaces it.
  const existing = await supabase.from("body_measurements").select("name, value_cm, source").eq("user_id", user.id);
  if (existing.error) return { errors: { form: SAVE_FAILED }, values };
  const scanned = new Map(existing.data.filter((m) => m.source === "scan").map((m) => [m.name, Number(m.value_cm)]));
  const rows = Object.entries(parsed.value)
    .filter(([name, value_cm]) => scanned.get(name) !== value_cm)
    .map(([name, value_cm]) => ({
      user_id: user.id,
      name,
      value_cm,
      range_cm: MANUAL_RANGE_CM,
      confidence: MANUAL_CONFIDENCE,
      source: "manual",
      vendor_job_id: null,
    }));
  if (rows.length) {
    const saved = await supabase.from("body_measurements").upsert(rows, { onConflict: "user_id,name" });
    if (saved.error) return { errors: { form: SAVE_FAILED }, values };
  }

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
