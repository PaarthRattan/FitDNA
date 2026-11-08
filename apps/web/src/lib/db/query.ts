import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./auth";

/** The signed-in user (or a redirect to sign-in) and a client acting as them. */
export async function signedIn(returnTo: string) {
  const user = await requireUser(returnTo);
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase isn't configured");
  return { user, supabase };
}

/** A query's data, or a thrown error: a page that can't load its data should say so, not render as if it had none. */
export function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) {
    throw new Error(`Couldn't load ${what}: ${result.error?.message ?? "no data returned"}`);
  }
  return result.data;
}
