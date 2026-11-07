/**
 * Where to send the user after signing in. Only same-site paths are allowed, so a
 * crafted `?next=` can't bounce someone to another site (an open redirect).
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  // Reject anything the URL parser would resolve off-site, e.g. control characters.
  try {
    const url = new URL(next, "https://fitdna.invalid");
    if (url.origin !== "https://fitdna.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
