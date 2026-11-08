import Link from "next/link";
import { FitZoneLegend, FooterNav, ScanSticker, SiteNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardSub, CardTitle, CardTitleBar, ChipRow, CtaBlock, Eyebrow, Sticker, TD, TD_BOLD, TH } from "@/components/ui";
import { SITE } from "@/lib/data";
import { loadRecentPredictions, type ListingSummary } from "@/lib/db/listings";
import { loadPassport } from "@/lib/db/passport";
import { FIT_ZONES } from "@/lib/fit-zones";
import { marketplaceLabel } from "@/lib/listings/url";
import { asZone, categoryLabel, measurementChips, type ReferenceRow } from "@/lib/passport/mappers";

export default async function WardrobePage() {
  const [{ references, status }, recent] = await Promise.all([loadPassport("/"), loadRecentPredictions()]);

  return (
    <>
      <TopBanner title={SITE.tagline} sticker={<ScanSticker />} callout={`Passport ${status.pct}%`} />

      <div className="flex flex-col md:flex-row flex-1">
        {/* Left rail */}
        <aside className="md:w-[230px] md:border-r border-b md:border-b-0 border-ink p-4 flex flex-col gap-4 shrink-0">
          <SiteNav />
          <CtaBlock>
            {status.next ? (
              <>
                Your Fit Passport is <b>{status.pct}% complete</b>. {status.next.why}
                <div className="mt-3">
                  <Button href={status.next.href}>{status.next.label}</Button>
                </div>
              </>
            ) : (
              <>
                Your Fit Passport is <b>complete</b>.
              </>
            )}
          </CtaBlock>
          <FitZoneLegend />
        </aside>

        {/* Main column */}
        <main className="flex-1 p-5 pb-6 flex flex-col gap-5 min-w-0">
          <Eyebrow tint="olive">Your wardrobe</Eyebrow>

          {references.length === 0 ? (
            <div className="border border-ink p-5 font-body text-sm flex flex-col gap-3">
              <p>
                Start with two or three pieces you own and know well: a tee, a knit, a jacket. FitDNA compares every
                listing against them.
              </p>
              <div>
                <Button href="/passport/garments/new">Add a reference garment</Button>
              </div>
            </div>
          ) : (
            references.map((r) => <GarmentCard key={r.id} garment={r} />)
          )}

          <Eyebrow tint="sky" size="md">
            Recent predictions
          </Eyebrow>
          {recent.length === 0 ? (
            <div className="border border-ink p-5 font-body text-sm flex flex-col gap-3">
              <p>No predictions yet. Save or buy a listing and it shows up here.</p>
              <div>
                <Button href="/listings/new" variant="secondary">
                  Paste a link
                </Button>
              </div>
            </div>
          ) : (
            <RecentPredictions listings={recent} />
          )}
        </main>
      </div>

      <FooterNav />
    </>
  );
}

/** Ribbon card: white title bar over the garment's fit-zone tint. */
function GarmentCard({ garment: g }: { garment: ReferenceRow }) {
  const zone = FIT_ZONES[asZone(g.fit_zone)];
  const category = categoryLabel(g.category);
  return (
    <Card>
      <CardTitleBar>
        <CardTitle>
          <Link href={`/passport/garments/${g.id}`} className="text-ink hover:text-primary">
            {g.title.toUpperCase()}
          </Link>
        </CardTitle>
        <CardSub>
          Reference · {category.toLowerCase()}
          {g.size_label ? ` · size ${g.size_label}` : ""}
        </CardSub>
      </CardTitleBar>
      <div className={`${zone.bg} px-4 py-3 font-body text-sm leading-[1.4]`}>
        Fits you {zone.label.toLowerCase()}. Every {category.toLowerCase()} listing is compared against this piece.
        <ChipRow chips={measurementChips(g)} className="mt-2" />
      </div>
      {SITE.showStickers && (
        <Sticker rotate={-8} className="absolute right-2 -top-3">
          REFERENCE
        </Sticker>
      )}
    </Card>
  );
}

/** Saved and bought listings with their current prediction. Real outcomes join this table with fit feedback (M7). */
function RecentPredictions({ listings }: { listings: ListingSummary[] }) {
  return (
    <div className="border border-ink overflow-x-auto">
      <table className="border-collapse w-full">
        <thead>
          <tr className="bg-tint-steel">
            <th className={TH}>LISTING</th>
            <th className={TH}>PREDICTED FIT</th>
            <th className={TH}>SCORE</th>
            <th className={`${TH} hidden sm:table-cell`}>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            const zone = l.fit?.prediction?.overall ?? null;
            return (
              <tr key={l.id}>
                <td className={TD}>
                  <Link href={`/search/${l.id}`} className="text-ink hover:text-primary">
                    {l.effective.title ?? `${marketplaceLabel(l.marketplace)} listing`}
                  </Link>
                </td>
                <td className={TD}>
                  {zone ? (
                    <span className={`${FIT_ZONES[zone].bg} border border-ink font-ui font-bold text-[11px] px-2 py-[3px] whitespace-nowrap`}>
                      {FIT_ZONES[zone].label}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={TD_BOLD}>{l.fit?.score?.score ?? "—"}</td>
                <td className={`${TD} hidden sm:table-cell`}>
                  {!l.purchased ? (
                    "Saved"
                  ) : l.outcome ? (
                    <>
                      Bought · fit <b>{FIT_ZONES[l.outcome].label.toLowerCase()}</b>
                    </>
                  ) : (
                    <Link href={`/feedback/${l.purchaseId}`}>Bought · how did it fit?</Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
