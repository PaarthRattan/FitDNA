import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, checked with Supabase Auth on the server. This is the real
 * authorisation check: the proxy's cookie check is only an optimistic redirect.
 * Never use `getSession()` for this; it trusts the cookie without verifying it.
 * Cached for the rest of the request. Null when signed out or not configured.
 *
 * Any page that calls this renders per request, never at build time, so one user's
 * page can't be prerendered and served to another.
 */
export const getUser = cache(async () => {
  await connection();
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});

/** The signed-in user, or a redirect to sign-in that returns to `returnTo` afterwards. */
export async function requireUser(returnTo: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}
