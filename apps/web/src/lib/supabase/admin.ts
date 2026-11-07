import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import type { Database } from "./types";

/**
 * A Supabase client with the secret key. It bypasses row-level security, so use it
 * only for what users can't do themselves (today: deleting their own account), and
 * only after checking who the user is with `getUser()`. Null when the secret key
 * isn't configured.
 */
export function createAdminClient() {
  const env = supabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!env || !secretKey) return null;
  return createClient<Database>(env.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
