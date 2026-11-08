/** Tunable limits for listing import. Change them here, never inline. */

/** Links one user may import per rolling 24 hours. Each new page costs a scrape credit. */
export const IMPORT_DAILY_CAP = 20;

/** A listing fetched more recently than this isn't fetched again. Matches Firecrawl's default `maxAge`. */
export const LISTING_CACHE_HOURS = 48;

/** How long an imported listing may be kept. Enforced nightly by `public.purge_expired()` (pg_cron); keep the two in step. */
export const LISTING_RETENTION_DAYS = 90;

/** Firecrawl's own page-load timeout. Kept well inside the import page's `maxDuration` (60 s). */
export const SCRAPE_TIMEOUT_MS = 30_000;

/**
 * An import still pending after this long was cut off (for example, the platform
 * stopped the function), so it's shown as timed out rather than polled forever.
 */
export const IMPORT_STALE_SECONDS = 75;

/**
 * The AI read starts only if the import is this far in, so it ends (AI_TIMEOUT_MS
 * later) before the page's 60 s `maxDuration`. Otherwise the regex reading stands.
 */
export const IMPORT_AI_START_BY_MS = 35_000;

/**
 * Photos are read during an import only if it's this far in: fetching up to four
 * photos (IMAGE_FETCH_TIMEOUT_MS) and the model call (AI_TIMEOUT_MS) must end inside
 * the page's 60 s `maxDuration`. Later, the user can still ask for it on the form.
 */
export const IMPORT_PHOTOS_START_BY_MS = 28_000;

/** Photos kept per listing (its own, in page order). */
export const LISTING_MAX_PHOTOS = 8;

/** Page text beyond this is ignored: listing details are near the top. */
export const MAX_PAGE_CHARS = 200_000;
