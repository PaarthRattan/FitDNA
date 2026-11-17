import { after } from "next/server";
import { getUser } from "@/lib/db/auth";
import { scanAvailability } from "@/lib/scan/access";
import { readCapped } from "@/lib/scan/body";
import { SCAN_DAILY_CAP, SCAN_MAX_UPLOAD_BYTES } from "@/lib/scan/constants";
import { parseScanUpload } from "@/lib/scan/parse";
import { runScan } from "@/lib/scan/run";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts a photo scan. A Route Handler, not a Server Action, because two photos are
 * over the 1 MB limit on action bodies.
 *
 * Checks, in order: signed in; scanning on, for this user, from this region; current
 * scan and data consents; the upload's size and contents; the daily cap. Then it
 * records the scan, hands the photos to `runScan` after the response, and answers with
 * the scan's id for the page to poll. The photos are held in memory only.
 *
 * Seconds. Covers the `after()` work too: the scan service gets up to SCAN_TIMEOUT_MS.
 * Needs Vercel's Pro plan (fluid compute); Hobby stops functions at 60 s.
 */
export const maxDuration = 300;

const DAY_MS = 24 * 3600 * 1000;
/** The user's access token must outlive this request, `after()` work included. */
const TOKEN_MIN_LIFE_MS = (300 + 60) * 1000;

type ErrorBody = { error: string; message: string; errors?: Record<string, string> };

const reply = (status: number, body: ErrorBody | { scanId: string }) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const user = await getUser();
  const supabase = await createClient();
  if (!user || !supabase) return reply(401, { error: "signed_out", message: "Sign in again to scan." });

  const availability = await scanAvailability(user.id);
  if (availability !== "ok") {
    return reply(availability === "region" ? 403 : 503, { error: availability, message: "Photo scans aren't available here." });
  }

  const [scanConsent, dataConsent] = await Promise.all([
    supabase.rpc("has_current_consent", { p_scope: "scan" }),
    supabase.rpc("has_current_consent", { p_scope: "data" }),
  ]);
  if (scanConsent.error || dataConsent.error) return reply(500, { error: "failed", message: "Couldn't start the scan. Please try again." });
  if (!scanConsent.data || !dataConsent.data) {
    return reply(403, { error: "consent", message: "Photo scans need your consent first." });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return reply(400, { error: "bad_request", message: "Send the photos as a form upload." });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > SCAN_MAX_UPLOAD_BYTES) return reply(413, { error: "too_large", message: "The photos are too large to send." });
  const bytes = await readCapped(request.body, SCAN_MAX_UPLOAD_BYTES);
  if (!bytes) return reply(413, { error: "too_large", message: "The photos are too large to send." });

  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    return reply(400, { error: "bad_request", message: "Couldn't read the upload. Please try again." });
  }
  const parsed = await parseScanUpload(form);
  if (!parsed.ok) return reply(422, { error: "invalid", message: "Check the highlighted fields.", errors: parsed.errors });

  const recent = await supabase
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  if (recent.error) return reply(500, { error: "failed", message: "Couldn't start the scan. Please try again." });
  if ((recent.count ?? 0) >= SCAN_DAILY_CAP) {
    return reply(429, { error: "cap", message: `That's ${SCAN_DAILY_CAP} scans in the last 24 hours, today's limit. Try again tomorrow.` });
  }

  // The work after the response writes as the user, from their access token. getUser()
  // has verified who they are; the session only supplies a token that will last.
  let session = (await supabase.auth.getSession()).data.session;
  if (!session || (session.expires_at ?? 0) * 1000 - Date.now() < TOKEN_MIN_LIFE_MS) {
    session = (await supabase.auth.refreshSession()).data.session;
  }
  if (!session?.access_token) return reply(401, { error: "signed_out", message: "Sign in again to scan." });

  const created = await supabase
    .from("scans")
    .insert({ user_id: user.id, adult_attested: true, height_cm: parsed.value.heightCm })
    .select("id")
    .single();
  if (created.error) {
    console.error("Scan: couldn't create the scan", created.error.message);
    return reply(500, { error: "failed", message: "Couldn't start the scan. Please try again." });
  }

  const job = { scanId: created.data.id, userId: user.id, accessToken: session.access_token, upload: parsed.value };
  after(() => runScan(job));
  return reply(202, { scanId: created.data.id });
}
