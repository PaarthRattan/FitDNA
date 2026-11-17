import "server-only";
import { isUuid } from "@/lib/passport/parse";
import { passportStatus } from "@/lib/passport/status";
import { check, signedIn } from "./query";

/**
 * Reads for the Fit Passport. Every function checks the user first; row-level
 * security then limits each query to that user's rows, and the explicit
 * `user_id` filter is a second line of defence. Failures throw: a page that can't
 * load its data should say so, not render as if the user had none.
 */

export interface ConsentState {
  granted: boolean;
  /** When the current state was recorded, or null if the user has never answered. */
  at: string | null;
}

/** The user's current consent for body data (`data`) or for photo scans (`scan`). */
export async function loadConsent(returnTo: string, scope: "data" | "scan" = "data"): Promise<ConsentState> {
  const { user, supabase } = await signedIn(returnTo);
  const rows = check(
    await supabase
      .from("consents")
      .select("action, created_at")
      .eq("user_id", user.id)
      .eq("scope", scope)
      .order("id", { ascending: false })
      .limit(1),
    "consent",
  );
  return { granted: rows[0]?.action === "granted", at: rows[0]?.created_at ?? null };
}

export async function loadPassport(returnTo: string) {
  const { user, supabase } = await signedIn(returnTo);
  const [consent, measurements, references, preferences] = await Promise.all([
    loadConsent(returnTo),
    supabase
      .from("body_measurements")
      .select("name, value_cm, range_cm, confidence, source, updated_at")
      .eq("user_id", user.id),
    supabase.from("reference_garments").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("fit_preferences").select("category, text").eq("user_id", user.id),
  ]);
  const measurementRows = check(measurements, "body measurements");
  const referenceRows = check(references, "reference garments");
  return {
    email: user.email ?? null,
    consent,
    measurements: measurementRows,
    references: referenceRows,
    preferences: check(preferences, "fit preferences"),
    status: passportStatus(
      measurementRows.map((m) => m.name),
      referenceRows.map((r) => r.category),
    ),
  };
}

/** One of the user's reference garments, or null if it doesn't exist or isn't theirs. */
export async function loadReference(id: string, returnTo: string) {
  const { user, supabase } = await signedIn(returnTo);
  if (!isUuid(id)) return null;
  const rows = check(
    await supabase.from("reference_garments").select("*").eq("id", id).eq("user_id", user.id).limit(1),
    "the garment",
  );
  return rows[0] ?? null;
}
