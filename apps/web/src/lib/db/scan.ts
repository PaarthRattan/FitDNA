import "server-only";
import { isUuid } from "@/lib/passport/parse";
import { AVATAR_BUCKET, AVATAR_LINK_SECONDS } from "@/lib/scan/constants";
import { readStoredResult, type StoredScanResult } from "@/lib/scan/result";
import { scanState, type ScanState } from "@/lib/scan/status";
import { check, signedIn } from "./query";

/**
 * Reads for photo scans and the avatar. Each checks the user first; row-level security
 * then limits every query (and the Storage bucket) to that user's own rows and files.
 */

export interface ScanView {
  id: string;
  state: ScanState;
  heightCm: number;
  createdAt: string;
  result: StoredScanResult | null;
}

/** One of the user's scans, or null if it doesn't exist or isn't theirs. */
export async function loadScan(id: string): Promise<ScanView | null> {
  const { user, supabase } = await signedIn(`/passport/scan/${encodeURIComponent(id)}`);
  if (!isUuid(id)) return null;
  const row = check(
    await supabase
      .from("scans")
      .select("id, status, error_code, updated_at, created_at, height_cm, result")
      .eq("id", id)
      .eq("user_id", user.id)
      .limit(1),
    "the scan",
  )[0];
  if (!row) return null;
  return {
    id: row.id,
    state: scanState(row),
    heightCm: Number(row.height_cm),
    createdAt: row.created_at,
    result: row.status === "done" ? readStoredResult(row.result) : null,
  };
}

export interface AvatarView {
  scanId: string;
  createdAt: string;
  /** A short-lived signed link to the GLB, or null if the file couldn't be found. */
  url: string | null;
}

/** The user's current avatar, or null if they have none. */
export async function loadAvatar(returnTo: string): Promise<AvatarView | null> {
  const { user, supabase } = await signedIn(returnTo);
  const row = check(
    await supabase.from("avatars").select("scan_id, storage_path, updated_at").eq("user_id", user.id).limit(1),
    "your avatar",
  )[0];
  if (!row) return null;
  const signed = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(row.storage_path, AVATAR_LINK_SECONDS);
  if (signed.error) console.error("Avatar: couldn't sign the link", signed.error.message);
  return { scanId: row.scan_id, createdAt: row.updated_at, url: signed.data?.signedUrl ?? null };
}

/** Whether the user has an avatar, without signing a link (for the passport overview). */
export async function hasAvatar(returnTo: string): Promise<boolean> {
  const { user, supabase } = await signedIn(returnTo);
  const rows = check(await supabase.from("avatars").select("scan_id").eq("user_id", user.id).limit(1), "your avatar");
  return rows.length > 0;
}
