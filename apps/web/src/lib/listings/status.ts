import { IMPORT_STALE_SECONDS } from "./constants";
import type { ScrapeError } from "./firecrawl";

/** Why an import didn't read the page. Matches `listing_imports.error_code`. */
export type ImportError = ScrapeError;

export const IMPORT_ERRORS: readonly ImportError[] = ["disabled", "blocked", "not_found", "timeout", "busy", "failed"];

export type ImportState =
  | { state: "working"; listingId: string }
  | { state: "done"; listingId: string }
  | { state: "failed"; listingId: string; error: ImportError };

export interface ImportRow {
  listing_id: string;
  status: string;
  error_code: string | null;
  updated_at: string;
}

/**
 * Where an import stands. One that has been pending too long was cut off before it
 * could record an outcome (for example, the platform stopped the function), so it
 * counts as timed out rather than being polled forever.
 */
export function importState(row: ImportRow, now = Date.now()): ImportState {
  if (row.status === "done") return { state: "done", listingId: row.listing_id };
  if (row.status === "failed") {
    const error = IMPORT_ERRORS.find((e) => e === row.error_code) ?? "failed";
    return { state: "failed", listingId: row.listing_id, error };
  }
  if (now - Date.parse(row.updated_at) > IMPORT_STALE_SECONDS * 1000) {
    return { state: "failed", listingId: row.listing_id, error: "timeout" };
  }
  return { state: "working", listingId: row.listing_id };
}

/** What to tell the user after an import, keyed by outcome. Every failure still leads to the manual form. */
export const IMPORT_MESSAGES: Record<ImportError | "done", string> = {
  done: "We read what we could from the listing. Check each number against the listing before you save.",
  disabled: "Reading listings automatically is switched off on this server, so enter the numbers from the listing yourself.",
  blocked: "The site didn't let us read this page. Enter the measurements from the listing yourself.",
  not_found: "The site says this listing doesn't exist. It may have sold or been taken down. You can still enter its measurements.",
  timeout: "The page took too long to load. Enter the measurements yourself, or paste the link again later.",
  busy: "Too many listings are being read right now. Enter the measurements yourself, or paste the link again in a minute.",
  failed: "Something went wrong reading the page. Enter the measurements yourself, or paste the link again later.",
};

export function importMessage(outcome: string | undefined): string | null {
  return outcome && outcome in IMPORT_MESSAGES ? IMPORT_MESSAGES[outcome as keyof typeof IMPORT_MESSAGES] : null;
}
