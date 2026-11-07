import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";
import type { Database } from "./types";

/**
 * A Supabase client for the current request, acting as the signed-in user, so
 * row-level security applies to everything it does. Create one per request; never
 * share it. Returns null when Supabase isn't configured.
 */
export async function createClient() {
  const env = supabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. That's fine: the proxy refreshes the
          // session before any page renders, so there's nothing to write here.
        }
      },
    },
  });
}
