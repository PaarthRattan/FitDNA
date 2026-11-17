import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import type { Database } from "./types";

/**
 * A client acting as one user from a bare access token, for work that runs after the
 * response (`after()`), when there are no cookies to read or write. Row-level security
 * applies exactly as for that user, so consent is still checked on every write: a
 * scan whose user withdraws consent mid-way can't store anything.
 *
 * It never refreshes the token (that would rotate the user's refresh token behind the
 * browser's back), so the caller must hand it a token with enough life left. Only
 * create one after `getUser()` has verified who the user is.
 */
export function createClientAsUser(accessToken: string) {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient<Database>(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
