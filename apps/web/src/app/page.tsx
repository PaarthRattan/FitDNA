import Link from "next/link";
import { FitZoneLegend, FooterNav, ScanSticker, SiteNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardSub, CardTitle, CardTitleBar, ChipRow, CtaBlock, Eyebrow, Sticker } from "@/components/ui";
import { SITE } from "@/lib/data";
import { loadPassport } from "@/lib/db/passport";
import { FIT_ZONES } from "@/lib/fit-zones";
import { asZone, categoryLabel, measurementChips, type ReferenceRow } from "@/lib/passport/mappers";

export default async function WardrobePage() {
  const { references, status } = await loadPassport("/");

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
          <div className="border border-ink p-5 font-body text-sm">
            No predictions yet. When you check a listing&apos;s fit, it shows up here with how it turned out.
          </div>
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
