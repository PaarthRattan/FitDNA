import Link from "next/link";
import { FitZoneLegend, FooterNav, ScanSticker, SiteNav, TopBanner } from "@/components/chrome";
import {
  Button,
  Card,
  CardSub,
  CardTitle,
  CardTitleBar,
  ChipRow,
  CtaBlock,
  Eyebrow,
  Photo,
  Sticker,
  TD,
  TD_BOLD,
  TH,
} from "@/components/ui";
import { GARMENTS, PASSPORT, PREDICTIONS, SITE, type Garment } from "@/lib/data";
import { FIT_ZONES } from "@/lib/fit-zones";

export default function WardrobePage() {
  return (
    <>
      <TopBanner title={SITE.tagline} sticker={<ScanSticker />} callout={`Passport ${PASSPORT.completePct}%`} />

      <div className="flex flex-col md:flex-row flex-1">
        {/* Left rail */}
        <aside className="md:w-[230px] md:border-r border-b md:border-b-0 border-ink p-4 flex flex-col gap-4 shrink-0">
          <SiteNav />
          <CtaBlock>
            Your Fit Passport is <b>{PASSPORT.completePct}% complete</b>. {PASSPORT.nudge}
            <div className="mt-3">
              <Button href="/passport">Add reference</Button>
            </div>
          </CtaBlock>
          <FitZoneLegend />
        </aside>

        {/* Main column */}
        <main className="flex-1 p-5 pb-6 flex flex-col gap-5 min-w-0">
          <Eyebrow tint="olive">Your wardrobe</Eyebrow>

          {GARMENTS.map((g) => (
            <GarmentCard key={g.id} garment={g} />
          ))}

          <Eyebrow tint="sky" size="md">
            Recent predictions
          </Eyebrow>
          <div className="overflow-x-auto">
            <table className="border-collapse w-full border border-ink">
              <thead>
                <tr>
                  <th className={TH}>ITEM</th>
                  <th className={TH}>SIZE</th>
                  <th className={TH}>PREDICTION</th>
                  <th className={TH}>CONFIDENCE</th>
                  <th className={TH}>OUTCOME</th>
                </tr>
              </thead>
              <tbody>
                {PREDICTIONS.map((p) => {
                  const zone = FIT_ZONES[p.zone];
                  return (
                    <tr key={p.item}>
                      <td className={TD}>{p.item}</td>
                      <td className={TD}>{p.size}</td>
                      <td className={TD}>
                        <span className={`${zone.bg} border border-ink px-1.5 py-px font-ui font-bold text-[11px]`}>
                          {zone.label}
                        </span>{" "}
                        {p.note}
                      </td>
                      <td className={TD_BOLD}>{p.confidence}%</td>
                      <td className={TD}>
                        {p.outcome === "Awaiting fit check" ? <Link href="/feedback">{p.outcome}</Link> : p.outcome}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <FooterNav />
    </>
  );
}

/** Ribbon card with the garment photo notched into the right edge. */
function GarmentCard({ garment: g }: { garment: Garment }) {
  const zone = FIT_ZONES[g.zone];
  return (
    <Card>
      <CardTitleBar>
        <CardTitle>{g.title}</CardTitle>
        <CardSub>{g.sub}</CardSub>
      </CardTitleBar>
      <div className={`${zone.bg} px-4 py-3 sm:pr-[200px] font-body text-sm leading-[1.4] min-h-16`}>
        {g.body}
        <ChipRow chips={g.chips} className="mt-2" />
      </div>
      <Photo
        label={g.photo}
        className="hidden sm:flex absolute right-3.5 -top-2 -bottom-2 w-[150px]"
      />
      {SITE.showStickers && g.sticker && (
        <Sticker rotate={-8} className="absolute right-2 sm:right-[150px] -top-3">
          {g.sticker}
        </Sticker>
      )}
    </Card>
  );
}
