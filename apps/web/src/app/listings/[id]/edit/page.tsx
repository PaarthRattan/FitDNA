import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { requireUser } from "@/lib/db/auth";
import { loadListing } from "@/lib/db/listings";
import type { Assumption } from "@/lib/listings/extract-measurements";
import { formInitial, type PartDetail } from "@/lib/listings/fit";
import { SOURCE_LABELS, formatPrice } from "@/lib/listings/labels";
import { importMessage } from "@/lib/listings/status";
import { marketplaceLabel } from "@/lib/listings/url";
import { ListingForm } from "./listing-form";

export const metadata: Metadata = { title: "Check the listing's numbers" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ASSUMED: Record<Assumption, string> = {
  unit: "we guessed the unit",
  basis: "we guessed whether it was laid flat",
  range: "the seller gave a range; this is the middle",
};

/** "From the seller: “Pit to pit 22"”. We guessed the unit, so check it." */
function hintFor(detail: PartDetail | undefined): string | undefined {
  if (!detail) return undefined;
  if (detail.source === "user") return "Your correction.";
  const from = detail.span ? `From ${SOURCE_LABELS[detail.source]}: “${detail.span}”.` : `From ${SOURCE_LABELS[detail.source]}.`;
  const assumed = detail.assumed.map((a) => ASSUMED[a]);
  return assumed.length ? `${from} Check it: ${assumed.join(", and ")}.` : from;
}

export default async function EditListingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const outcome = first((await searchParams).fetch);
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
