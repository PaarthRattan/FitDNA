import "server-only";
import { LISTING_CACHE_HOURS, MAX_PAGE_CHARS, SCRAPE_TIMEOUT_MS } from "./constants";

/**
 * Fetches one listing page through Firecrawl's scrape API (v2), as markdown plus the
 * page's image URLs: 1 credit per page. Called with plain `fetch`, so there's no SDK
 * dependency. Only the listing URL is sent; nothing about the user.
 *
 * Off unless both FIRECRAWL_ENABLED=true and FIRECRAWL_API_KEY are set, so CI and
 * local development never spend credits by accident. Nothing here runs at import
 * time.
 */

/** FIRECRAWL_API_URL points at a self-hosted Firecrawl (or a local stub in tests); defaults to the hosted API. */
function endpoint(): string {
  const base = process.env.FIRECRAWL_API_URL?.trim() || "https://api.firecrawl.dev";
  return `${base.replace(/\/+$/, "")}/v2/scrape`;
}

export type ScrapeError = "disabled" | "blocked" | "not_found" | "timeout" | "busy" | "failed";

export type ScrapeResult =
  | { ok: true; markdown: string; images: unknown; metadata: Record<string, unknown> }
  | { ok: false; error: ScrapeError };

export function firecrawlEnabled(): boolean {
  return process.env.FIRECRAWL_ENABLED === "true" && Boolean(process.env.FIRECRAWL_API_KEY);
}

/** What the target site's own HTTP status means for us. */
export function siteStatusError(status: unknown): ScrapeError | null {
  if (typeof status !== "number") return null;
  if ((status >= 200 && status < 300) || status === 304) return null;
  if (status === 404 || status === 410) return "not_found";
  return "blocked";
}

/** What a Firecrawl API error status means for us. */
export function apiStatusError(status: number): ScrapeError {
  if (status === 408) return "timeout";
  if (status === 429) return "busy";
  return "failed";
}

export async function scrapeListing(url: string): Promise<ScrapeResult> {
  if (!firecrawlEnabled()) return { ok: false, error: "disabled" };

  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown", "images"],
        onlyMainContent: true,
        blockAds: true,
        maxAge: LISTING_CACHE_HOURS * 3600 * 1000,
        timeout: SCRAPE_TIMEOUT_MS,
      }),
      // Firecrawl's own timeout, plus time for the response to arrive.
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS + 10_000),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    if (!timedOut) console.error("Firecrawl request failed", error instanceof Error ? error.message : error);
    return { ok: false, error: timedOut ? "timeout" : "failed" };
  }

  if (!response.ok) {
    // 401 and 402 (bad key, out of credits) need someone to act, so they're logged.
    if (response.status === 401 || response.status === 402) console.error("Firecrawl refused the request", response.status);
    return { ok: false, error: apiStatusError(response.status) };
  }

  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: Record<string, unknown> } | null;
  const data = body?.success ? body.data : undefined;
  const metadata = (data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;
  const siteError = siteStatusError(metadata.statusCode);
  if (siteError) return { ok: false, error: siteError };
  if (!data || typeof data.markdown !== "string") return { ok: false, error: "failed" };

  return { ok: true, markdown: data.markdown.slice(0, MAX_PAGE_CHARS), images: data.images, metadata };
}
