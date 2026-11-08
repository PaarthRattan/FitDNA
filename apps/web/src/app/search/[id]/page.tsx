import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FooterNav, TopBanner } from "@/components/chrome";
import {
  Button,
  Card,
  CardSub,
  CardTitle,
  CardTitleBar,
  ChipRow,
  ConfidenceBar,
  ConfidenceSeal,
  Eyebrow,
  Photo,
  Sticker,
  TD,
  TD_BOLD,
  TH,
} from "@/components/ui";
import { loadListing } from "@/lib/db/listings";
import { FIT_ZONES, FIT_ZONE_ORDER } from "@/lib/fit-zones";
import { FIT_PARTS } from "@/lib/fit/constants";
import { formatCm } from "@/lib/fit/templates";
import type { PartResult } from "@/lib/fit/types";
import {
  GAP_ACTIONS,
  GAP_MESSAGES,
  PART_LABELS,
  SCORE_LABELS,
  SOURCE_LABELS,
  basisNote,
  formatPrice,
  gapHref,
  listingChips,
} from "@/lib/listings/labels";
import { marketplaceLabel } from "@/lib/listings/url";
import { markBought, saveListing, undoBought, unsaveListing } from "../../listings/actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SAVED: Record<string, string> = {
  fit: "Saved. The prediction below uses your numbers.",
  listing: "Added to Saved.",
  bought: "Recorded as bought. After it arrives, you'll be able to say how it fits.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const listing = await loadListing((await params).id);
  return { title: listing ? `Fit map — ${marketplaceLabel(listing.summary.marketplace)}` : "Fit map" };
}

/** "−2 cm vs. grey zip-up", "+4 cm vs. a typical knit on you", or why there's no comparison. */
function partNote(r: PartResult, category: string | null): string {
  if (r.deltaCm === null) return r.source ? "Nothing to compare with" : "Not in the listing";
  const sign = r.deltaCm > 0 ? "+" : r.deltaCm < 0 ? "−" : "±";
  const against = r.anchor.kind === "reference" ? r.anchor.referenceTitle : `a typical ${category ?? "garment"} on you`;
  return `${sign}${formatCm(r.deltaCm)} cm vs. ${against}`;
}

export default async function FitMapPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const saved = SAVED[first((await searchParams).saved) ?? ""];
  const listing = await loadListing(id);
  if (!listing) notFound();

  const { summary: l, signedIn } = listing;
  const site = marketplaceLabel(l.marketplace);
  const prediction = l.fit?.prediction ?? null;
  const score = l.fit?.score ?? null;
  const gap = signedIn ? l.fit?.gap ?? null : "signed_out";
  const tint = prediction?.overall ? FIT_ZONES[prediction.overall].bg : "bg-canvas";

  return (
    <>
      <TopBanner title="Fit map" callout={l.price !== null ? `${site} · ${formatPrice(l.price, l.currency)}` : site} />
      <Eyebrow tint="periwinkle">{site} — fit map</Eyebrow>

      <main className="p-5 flex flex-col md:flex-row gap-5 flex-1">
        <div className="md:w-[250px] shrink-0 flex flex-col gap-3">
          {saved && (
            <p role="status" className="border border-ink bg-tint-lime px-3 py-2 font-ui font-bold text-xs">
              {saved}
            </p>
          )}
          <Photo label="Listing photo" className="h-[240px] p-3" />
          <div className="flex items-center gap-3">
            <ConfidenceSeal score={score?.score ?? null} />
            <div className="font-body text-[13px] leading-[1.4]">
              {score?.score != null
                ? "Purchase Confidence Score for this listing, given your Fit Passport."
                : "No score until the fit can be predicted."}
            </div>
          </div>
          {prediction && (
            <div className="border border-ink p-3 font-body text-[13px] flex items-center justify-between gap-2">
              Fit confidence <ConfidenceBar pct={prediction.confidence} />
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <Card>
            <CardTitleBar>
              <CardTitle>{site.toUpperCase()}</CardTitle>
              <CardSub>{l.effective.title ?? "Untitled listing"}</CardSub>
              <span className="flex-1" />
              {l.url && (
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-ui font-bold text-xs">
                  Open on {site} ↗
                </a>
              )}
            </CardTitleBar>
            <div className={`${tint} px-4 py-3 font-body text-sm leading-[1.45]`}>
              {prediction ? (
                <>
                  <b>{prediction.verdict}</b> {basisNote(l.effective)}
                </>
              ) : (
                gap && (
                  <div className="flex flex-col gap-2 items-start">
                    <b>{GAP_MESSAGES[gap]}</b>
                    <Button size="sm" href={gapHref(gap, l.id)}>
                      {GAP_ACTIONS[gap]}
                    </Button>
                  </div>
                )
              )}
              <ChipRow chips={listingChips(l.effective, { sellerRating: l.sellerRating, isDemo: l.isDemo })} className="mt-2" />
            </div>
          </Card>

          {prediction && (
            <Card>
              <CardTitleBar>
                <CardTitle>ZONE BY ZONE — THIS GARMENT ON YOU</CardTitle>
              </CardTitleBar>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {FIT_PARTS.map((part) => {
                  const r = prediction.parts[part];
                  return (
                    <div key={part} className={`${r.zone ? FIT_ZONES[r.zone].bg : "bg-canvas"} border border-ink p-3 text-center`}>
                      <div className="font-ui font-bold text-[11px]">{PART_LABELS[part].toUpperCase()}</div>
                      <div className="font-display font-black text-lg leading-none mt-1">{r.zone ? FIT_ZONES[r.zone].label : "—"}</div>
                      <div className="font-body text-[11px] leading-tight mt-1.5">{partNote(r, l.effective.category)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-ink px-4 py-2.5 font-body text-xs flex gap-3 flex-wrap">
                {FIT_ZONE_ORDER.map((k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 border border-ink inline-block ${FIT_ZONES[k].bg}`} />
                    {FIT_ZONES[k].legend}
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardTitleBar>
              <CardTitle>THE LISTING&apos;S MEASUREMENTS</CardTitle>
              <CardSub>Laid flat; chest shown as given</CardSub>
            </CardTitleBar>
            <div className="overflow-x-auto">
              <table className="border-collapse w-full">
                <thead>
                  <tr className="bg-tint-steel">
                    <th className={TH}>PART</th>
                    <th className={TH}>VALUE</th>
                    <th className={TH}>FROM</th>
                  </tr>
                </thead>
                <tbody>
                  {FIT_PARTS.map((part) => {
                    const m = l.effective.measurements[part];
                    const detail = l.effective.details[part];
                    const value = m
                      ? `${formatCm(m.cm)} cm${part === "chest" && "basis" in m ? (m.basis === "flat" ? " flat" : " around") : ""}`
                      : "—";
                    return (
                      <tr key={part}>
                        <td className={TD}>{PART_LABELS[part]}</td>
                        <td className={`${TD_BOLD} whitespace-nowrap`}>{value}</td>
                        <td className={TD}>{detail ? SOURCE_LABELS[detail.source] : "Not given"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {listing.chart && (
            <Card>
              <CardTitleBar>
                <CardTitle>SIZE CHART</CardTitle>
                <CardSub>Read by AI from the listing&apos;s photos; check it against them</CardSub>
              </CardTitleBar>
              {listing.recommendation && (
                <div className={`${FIT_ZONES[listing.recommendation.prediction.overall!].bg} border-b border-ink px-4 py-2.5 font-body text-sm`}>
                  <b>Best size for you: {listing.recommendation.label}.</b> {listing.recommendation.prediction.verdict}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="border-collapse w-full">
                  <thead>
                    <tr className="bg-tint-steel">
                      <th className={TH}>SIZE</th>
                      <th className={TH}>CHEST{listing.chart.chestBasis === "flat" ? " (FLAT)" : ""}</th>
                      <th className={TH}>SHOULDER</th>
                      <th className={TH}>LENGTH</th>
                      <th className={TH}>SLEEVE</th>
                      {listing.recommendation && <th className={TH}>ON YOU</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {listing.chart.rows.map((r) => {
                      const ranked = listing.recommendation?.ranked.find((x) => x.label === r.label);
                      const cell = (v: number | null) => (v === null ? "—" : `${formatCm(v)} cm`);
                      return (
                        <tr key={r.label}>
                          <td className={TD_BOLD}>
                            {r.label}
                            {listing.recommendation?.label === r.label && (
                              <Sticker rotate={-4} className="ml-2">
                                BEST
                              </Sticker>
                            )}
                          </td>
                          <td className={TD}>{cell(r.chest_cm)}</td>
                          <td className={TD}>{cell(r.shoulder_cm)}</td>
                          <td className={TD}>{cell(r.length_cm)}</td>
                          <td className={TD}>{cell(r.sleeve_cm)}</td>
                          {listing.recommendation && <td className={TD}>{ranked?.overall ? FIT_ZONES[ranked.overall].label : "—"}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {score && (
            <Card>
              <CardTitleBar>
                <CardTitle>WHAT THE SCORE IS BASED ON</CardTitle>
              </CardTitleBar>
              <div className="overflow-x-auto">
                <table className="border-collapse w-full">
                  <tbody>
                    {score.components.map((c) => (
                      <tr key={c.key}>
                        <td className={TD}>{SCORE_LABELS[c.key].label}</td>
                        <td className={TD_BOLD}>{c.value === null ? SCORE_LABELS[c.key].missing : `${c.value} / 100`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="flex gap-2 flex-wrap">
            {signedIn && (
              <Button href={`/listings/${l.id}/edit`} variant={prediction ? "secondary" : "primary"}>
                Check the numbers
              </Button>
            )}
            {signedIn && (
              <form action={l.saved ? unsaveListing : saveListing}>
                <input type="hidden" name="id" value={l.id} />
                <Button type="submit" variant="secondary">
                  {l.saved ? "Saved ✓ — remove" : "Save"}
                </Button>
              </form>
            )}
            {signedIn && !l.isDemo && (l.purchased || prediction) && (
              <form action={l.purchased ? undoBought : markBought}>
                <input type="hidden" name="id" value={l.id} />
                <Button type="submit" variant="secondary">
                  {l.purchased ? "Bought ✓ — undo" : "I bought this"}
                </Button>
              </form>
            )}
            <Button variant="secondary" href="/search">
              Back to results
            </Button>
          </div>
          {!signedIn && (
            <p className="font-body text-xs text-[#333]">
              <Link href={`/login?next=${encodeURIComponent(`/search/${l.id}`)}`}>Sign in</Link> to see how this fits you.
            </p>
          )}
        </div>
      </main>

      <FooterNav />
    </>
  );
}
