"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where the emailed link should land. Supabase also checks it against the project's allow-list. */
async function siteOrigin(): Promise<string | null> {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin");
}

/** Emails a one-time sign-in link. Signing in for the first time creates the account. */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));
  if (email.length > 254 || !EMAIL.test(email)) {
    return { status: "error", message: "Enter a valid email address.", email };
  }

  const supabase = await createClient();
  const origin = await siteOrigin();
  if (!supabase || !origin) {
    return { status: "error", message: "Sign-in isn't set up on this server yet.", email };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("sendMagicLink failed", { status: error.status, code: error.code });
    const message =
      error.status === 429
        ? "Too many sign-in emails. Wait a minute, then try again."
        : "Couldn't send the link. Try again in a moment.";
    return { status: "error", message, email };
  }
  return { status: "sent", email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/login");
}
