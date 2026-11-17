import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Pages that need a signed-in user. This check is optimistic: it only reads the
 * session cookie, so it can redirect early. Every data read checks again with
 * `getUser()` in `src/lib/db/`.
 */
const PROTECTED_PREFIXES = ["/passport", "/listings", "/saved", "/feedback"];

function isProtected(pathname: string): boolean {
  return pathname === "/" || PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  // Without a Supabase project the prototype runs on mock data, signed out.
  const env = supabaseEnv();
  if (!env) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        // Make refreshed tokens visible to this request's pages, and send them to the browser.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Includes Cache-Control: a response that sets auth cookies must never be cached.
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Verifies the session JWT and refreshes it if expired. Must run before anything
  // else touches the response, or a refreshed token could be lost.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  if (!signedIn && isProtected(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(login);
    // Carry over any cookie changes (e.g. a failed refresh clearing a stale session).
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [key, value] of response.headers) if (key.toLowerCase() === "cache-control") redirect.headers.set(key, value);
    return redirect;
  }
  return response;
}

export const config = {
  // Everything except static assets, image optimisation and the scan page's pose checker.
  matcher: ["/((?!_next/static|_next/image|mediapipe/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
