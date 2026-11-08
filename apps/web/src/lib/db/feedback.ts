import "server-only";
import type { FitZone } from "@/lib/fit-zones";
import { FIT_PARTS } from "@/lib/fit/constants";
import type { FitPart } from "@/lib/fit/types";
import { readSnapshot, type Snapshot } from "@/lib/feedback/feedback";
import { FIT_ZONE_ORDER } from "@/lib/fit-zones";
import { isUuid } from "@/lib/passport/parse";
import { check, signedIn } from "./query";

/** Reads for fit checks: the user's purchases, each with its prediction and any answer. */

export interface PurchaseFeedback {
  overall: FitZone;
  parts: Partial<Record<FitPart, FitZone>>;
  kept: boolean | null;
  updatedAt: string;
}

export interface PurchaseWithFeedback {
  id: string;
  listingId: string | null;
  marketplace: string;
  title: string | null;
  category: string;
  sizeLabel: string | null;
  purchasedAt: string;
  predicted: Snapshot;
  feedback: PurchaseFeedback | null;
}

const asZone = (v: string | null): FitZone | null => FIT_ZONE_ORDER.find((z) => z === v) ?? null;

type FeedbackRow = { purchase_id: string; overall: string; kept: boolean | null; updated_at: string } & Record<FitPart, string | null>;

function toFeedback(row: FeedbackRow | undefined): PurchaseFeedback | null {
  const overall = row ? asZone(row.overall) : null;
  if (!row || !overall) return null;
  const parts: Partial<Record<FitPart, FitZone>> = {};
  for (const p of FIT_PARTS) {
    const z = asZone(row[p]);
    if (z) parts[p] = z;
  }
  return { overall, parts, kept: row.kept, updatedAt: row.updated_at };
}

async function load(returnTo: string, id?: string): Promise<PurchaseWithFeedback[]> {
  const { user, supabase } = await signedIn(returnTo);
  let purchases = supabase
    .from("purchases")
    .select("id, listing_id, marketplace, listing_title, category, size_label, prediction, purchased_at")
    .eq("user_id", user.id)
    .order("purchased_at", { ascending: false });
  if (id) purchases = purchases.eq("id", id);
  const [rows, answers] = await Promise.all([
    purchases,
    supabase.from("fit_feedback").select("purchase_id, overall, chest, shoulder, length, sleeve, kept, updated_at").eq("user_id", user.id),
  ]);
  const byPurchase = new Map(check(answers, "fit checks").map((a) => [a.purchase_id, a]));
  return check(rows, "purchases").map((p) => ({
    id: p.id,
    listingId: p.listing_id,
    marketplace: p.marketplace,
    title: p.listing_title,
    category: p.category,
    sizeLabel: p.size_label,
    purchasedAt: p.purchased_at,
    predicted: readSnapshot(p.prediction),
    feedback: toFeedback(byPurchase.get(p.id)),
  }));
}

export function loadPurchases(): Promise<PurchaseWithFeedback[]> {
  return load("/feedback");
}

/** One of the user's purchases, or null if it doesn't exist or isn't theirs. */
export async function loadPurchase(id: string): Promise<PurchaseWithFeedback | null> {
  if (!isUuid(id)) {
    await signedIn(`/feedback/${encodeURIComponent(id)}`);
    return null;
  }
  return (await load(`/feedback/${id}`, id))[0] ?? null;
}
