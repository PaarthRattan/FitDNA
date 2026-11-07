import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardSub, CardTitle, CardTitleBar, ChipRow, ConfidenceSeal, Eyebrow, Photo } from "@/components/ui";
import { LISTINGS, MEASUREMENTS } from "@/lib/data";
import { FIT_ZONES, FIT_ZONE_ORDER } from "@/lib/fit-zones";

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return LISTINGS.map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const listing = LISTINGS.find((l) => l.id === id);
  return { title: listing ? `Fit map — ${listing.market}` : "Fit map" };
}

export default async function FitMapPage({ params }: { params: Params }) {
  const { id } = await params;
  const listing = LISTINGS.find((l) => l.id === id);
  if (!listing) notFound();

  const zone = FIT_ZONES[listing.zone];
  // Fit map v1: coloured zones, no cloth physics (ROADMAP phase 2).
  const zones = [
    { part: "Shoulders", zone: listing.zone },
    { part: "Chest", zone: listing.zone },
    { part: "Body length", zone: listing.zone === "tight" ? "fitted" : listing.zone },
    { part: "Sleeve", zone: "ideal" },
  ] as const;

  return (
    <>
      <TopBanner title="Fit map" callout={`${listing.market} · ${listing.price}`} />
      <Eyebrow tint="periwinkle">{listing.market} — fit map</Eyebrow>

      <main className="p-5 flex flex-col md:flex-row gap-5 flex-1">
        <div className="md:w-[250px] shrink-0 flex flex-col gap-3">
          <Photo label="Avatar with garment fit-zone overlay (front view)" className="h-[340px] p-3" />
          <div className="flex items-center gap-3">
            <ConfidenceSeal score={listing.score} />
            <div className="font-body text-[13px] leading-[1.4]">
              Purchase Confidence Score for this listing, given your Fit Passport.
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <Card>
            <CardTitleBar>
              <CardTitle>{listing.market}</CardTitle>
              <CardSub>{listing.title}</CardSub>
            </CardTitleBar>
            <div className={`${zone.bg} px-4 py-3 font-body text-sm leading-[1.45]`}>
              <b>{listing.verdict}</b> {listing.body}
              <ChipRow chips={listing.chips} className="mt-2" />
            </div>
          </Card>

          <Card>
            <CardTitleBar>
              <CardTitle>ZONE BY ZONE — GARMENT VS. YOUR BODY</CardTitle>
            </CardTitleBar>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {zones.map((z) => (
                <div key={z.part} className={`${FIT_ZONES[z.zone].bg} border border-ink p-3 text-center`}>
                  <div className="font-ui font-bold text-[11px]">{z.part.toUpperCase()}</div>
                  <div className="font-display font-black text-lg leading-none mt-1">{FIT_ZONES[z.zone].label}</div>
                </div>
              ))}
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

          <Card>
            <CardTitleBar>
              <CardTitle>YOUR MEASUREMENTS USED</CardTitle>
            </CardTitleBar>
            <div className="px-4 py-3 font-body text-[13px] flex gap-x-6 gap-y-1 flex-wrap">
              {MEASUREMENTS.slice(0, 4).map((m) => (
                <span key={m.name}>
                  {m.name}: <b className="font-ui">{m.value}</b>
                </span>
              ))}
            </div>
          </Card>

          <div className="flex gap-2 flex-wrap">
            <Button href="/alerts">Track price</Button>
            <Button variant="secondary" href="/search">
              Back to results
            </Button>
          </div>
        </div>
      </main>

      <FooterNav />
    </>
  );
}
