import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardTitleBar, CardTitle, ConfidenceBar, CtaBlock, Eyebrow, Photo, Sticker, TD, TD_BOLD, TH } from "@/components/ui";
import { FIT_PREFERENCES, MEASUREMENTS, PASSPORT, REFERENCE_SLOTS, SITE } from "@/lib/data";

export const metadata: Metadata = { title: "Fit Passport" };

export default function PassportPage() {
  const scanned = REFERENCE_SLOTS.filter((r) => !r.empty).length;
  return (
    <>
      <TopBanner title="Fit Passport" callout={`Scan of ${PASSPORT.lastScan}`} />
      <Eyebrow tint="salmon">Your Fit Passport</Eyebrow>

      <main className="flex flex-col md:flex-row gap-5 p-5 flex-1">
        {/* Avatar column */}
        <div className="md:w-[250px] shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Photo label="3D body avatar render (front view, fit-zone overlay)" className="h-[340px] p-3" />
            {SITE.showStickers && PASSPORT.rescanDue && (
              <Sticker rotate={6} className="absolute -right-2.5 -top-2.5">
                RE-SCAN DUE
              </Sticker>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" href="/passport">
              New scan
            </Button>
            <Button className="flex-1" variant="secondary" href="/settings">
              Edit
            </Button>
          </div>
          <CtaBlock className="text-[13px] p-3">
            Raw scan photos were <b>deleted after processing</b>. Only measurements and your avatar mesh are stored —
            encrypted, never sold.
          </CtaBlock>
        </div>

        {/* Measurements column */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <Card>
            <CardTitleBar>
              <CardTitle>BODY MEASUREMENTS — ESTIMATED FROM GUIDED SCAN</CardTitle>
            </CardTitleBar>
            <div className="overflow-x-auto">
              <table className="border-collapse w-full">
                <thead>
                  <tr className="bg-tint-steel">
                    <th className={TH}>MEASUREMENT</th>
                    <th className={TH}>VALUE</th>
                    <th className={TH}>RANGE</th>
                    <th className={TH}>CONFIDENCE</th>
                  </tr>
                </thead>
                <tbody>
                  {MEASUREMENTS.map((m) => (
                    <tr key={m.name}>
                      <td className={TD}>{m.name}</td>
                      <td className={TD_BOLD}>{m.value}</td>
                      <td className={`${TD} text-[#333]`}>{m.range}</td>
                      <td className={TD}>
                        <ConfidenceBar pct={m.confidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardTitleBar>
              <CardTitle>FIT PREFERENCES — WHAT “GOOD FIT” MEANS TO YOU</CardTitle>
            </CardTitleBar>
            <div className="bg-tint-lime px-4 py-3 flex flex-col gap-2">
              {FIT_PREFERENCES.map((pf) => (
                <div key={pf.category} className="flex items-baseline gap-2.5 font-body text-sm">
                  <span className="font-ui font-bold text-xs bg-canvas border border-ink px-2 py-0.5 shrink-0">
                    {pf.category}
                  </span>
                  <span>{pf.text}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitleBar>
              <CardTitle>
                REFERENCE GARMENTS — {scanned} OF {REFERENCE_SLOTS.length} SCANNED
              </CardTitle>
            </CardTitleBar>
            <div className="bg-tint-sky px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {REFERENCE_SLOTS.map((r) => (
                <div
                  key={r.name}
                  className="border border-ink bg-canvas p-2 font-body text-xs leading-[1.35] text-center"
                >
                  <div className="photo-stripes h-14 border border-ink mb-1.5 flex items-center justify-center font-mono text-[10px] text-[#666]">
                    {r.photo}
                  </div>
                  <b className="font-ui text-[11px]">{r.name}</b>
                  <br />
                  {r.role}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>

      <FooterNav />
    </>
  );
}
