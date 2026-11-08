import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { aiEnabled } from "@/lib/ai/client";
import { requireUser } from "@/lib/db/auth";
import { loadListing } from "@/lib/db/listings";
import type { Assumption } from "@/lib/listings/extract-measurements";
import { formInitial, type PartDetail } from "@/lib/listings/fit";
import { formatPrice } from "@/lib/listings/labels";
import { importMessage } from "@/lib/listings/status";
import { marketplaceLabel } from "@/lib/listings/url";
import { Button } from "@/components/ui";
import { readPhotos } from "../../actions";
import { ListingForm } from "./listing-form";

export const metadata: Metadata = { title: "Check the listing's numbers" };

/** Seconds. Also the limit for "Read the photos" (a Server Action on this page). A literal, for Next. */
export const maxDuration = 60;

const PHOTO_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  read: { text: "We read the photos. Anything found is filled in below, marked “read by AI from a photo”. Check it against the photos.", ok: true },
  nothing: { text: "The photos don't show a tape measure or size chart we could read clearly.", ok: false },
  no_photos: { text: "This listing's photos couldn't be fetched.", ok: false },
  failed: { text: "Couldn't read the photos just now. Try again in a minute.", ok: false },
  disabled: { text: "Reading photos is switched off on this server.", ok: false },
  already: { text: "These photos have already been read.", ok: true },
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ASSUMED: Record<Assumption, string> = {
  unit: "we guessed the unit",
  basis: "we guessed whether it was laid flat",
  range: "the seller gave a range; this is the middle",
};

const FROM: Record<Exclude<PartDetail["source"], "user">, string> = {
  seller: "From the seller",
  size_chart: "From the size chart",
  ai_text: "Read by AI from the listing",
  ai_photo: "Read by AI from a photo",
  estimated: "Typical for the size",
};

/** "From the seller: “Pit to pit 22"”. Check it: we guessed the unit." */
function hintFor(detail: PartDetail | undefined): string | undefined {
  if (!detail) return undefined;
  if (detail.source === "user") return "Your correction.";
  const from = detail.span ? `${FROM[detail.source]}: “${detail.span}”.` : `${FROM[detail.source]}.`;
  const checks = detail.assumed.map((a) => ASSUMED[a]);
  if (detail.source === "ai_text" || detail.source === "ai_photo") checks.unshift("AI can misread");
  return checks.length ? `${from} Check it: ${checks.join(", and ")}.` : from;
}

export default async function EditListingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const outcome = first(query.fetch);
  const photoMessage = PHOTO_MESSAGES[first(query.photos) ?? ""];
  await requireUser(`/listings/${id}/edit`);
  const listing = await loadListing(id);
  if (!listing) notFound();

  const { summary, override } = listing;
  const site = marketplaceLabel(summary.marketplace);
  const message = importMessage(outcome);
  const details = summary.effective.estimated ? {} : summary.effective.details;
  const hints = {
    chest: hintFor(details.chest),
    shoulder: hintFor(details.shoulder),
    length: hintFor(details.length),
    sleeve: hintFor(details.sleeve),
  };

  return (
    <>
      <TopBanner title="Search all markets" callout={summary.price !== null ? formatPrice(summary.price, summary.currency) : undefined} />
      <Eyebrow tint="periwinkle">Check the numbers</Eyebrow>
      <main className="p-5 flex-1 flex flex-col gap-4">
        {message && (
          <p role="status" className={`border border-ink px-3 py-2 font-body text-sm max-w-2xl ${outcome === "done" ? "bg-tint-lime" : "bg-tint-peach"}`}>
            {message}
          </p>
        )}
        {photoMessage && (
          <p role="status" className={`border border-ink px-3 py-2 font-body text-sm max-w-2xl ${photoMessage.ok ? "bg-tint-lime" : "bg-tint-peach"}`}>
            {photoMessage.text}
          </p>
        )}
        {!summary.isDemo && listing.photos.length > 0 && !listing.photosRead && aiEnabled() && (
          <form action={readPhotos} className="border border-ink bg-tint-sky px-3 py-2.5 font-body text-sm max-w-2xl flex flex-col sm:flex-row sm:items-center gap-2.5">
            <input type="hidden" name="id" value={summary.id} />
            <span className="flex-1">
              Measurements shown in the photos, like a tape measure or a size chart? Up to four of the listing&apos;s photos
              are sent to DeepSeek&apos;s AI model to read them. Nothing about you is sent.
            </span>
            <Button type="submit" size="sm">
              Read the photos
            </Button>
          </form>
        )}
        {summary.effective.outOfScope && (
          <p className="border border-ink bg-tint-salmon px-3 py-2 font-body text-sm max-w-2xl">
            This doesn&apos;t look like a top or jacket. FitDNA only predicts tops and jackets for now; if it is one, choose
            which kind below.
          </p>
        )}
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>{site.toUpperCase()}</CardTitle>
            <CardSub>{summary.effective.title ?? "Untitled listing"}</CardSub>
            <span className="flex-1" />
            {summary.url && (
              <a href={summary.url} target="_blank" rel="noopener noreferrer" className="font-ui font-bold text-xs">
                Open on {site} ↗
              </a>
            )}
          </CardTitleBar>
          <div className="p-4">
            <ListingForm
              initial={{ id: summary.id, ...formInitial(summary.effective, override) }}
              hints={hints}
              titlePlaceholder={listing.own.title ?? `${site} listing`}
            />
          </div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
