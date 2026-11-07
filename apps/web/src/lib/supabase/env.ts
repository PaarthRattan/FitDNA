export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

/**
 * The Supabase project's public settings, or null when they aren't configured
 * (no `.env.local` yet). Null keeps the prototype runnable on mock data: the proxy
 * skips auth and the login page explains what's missing.
 */
export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? { url, publishableKey } : null;
}
