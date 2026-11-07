import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

/**
 * Where the emailed sign-in link lands. Handles both link formats Supabase can send:
 * `?code=` (the default PKCE flow) and `?token_hash=&type=` (custom email templates).
 * On success the session cookies are set and the user goes on to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const failed = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}&next=${encodeURIComponent(next)}`, origin));

  const supabase = await createClient();
  if (!supabase) return failed("config");

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  return ok ? NextResponse.redirect(new URL(next, origin)) : failed("link");
}
