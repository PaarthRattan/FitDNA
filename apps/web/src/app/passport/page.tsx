import type { Metadata } from "next";
import Link from "next/link";
import { FooterNav, TopBanner } from "@/components/chrome";
import {
  Button,
  Card,
  CardSub,
  CardTitle,
  CardTitleBar,
  Chip,
  ChipRow,
  ConfidenceBar,
  CtaBlock,
  Eyebrow,
  TD,
  TD_BOLD,
  TH,
} from "@/components/ui";
import { FIT_ZONES } from "@/lib/fit-zones";
import { loadPassport } from "@/lib/db/passport";
import { hasAvatar } from "@/lib/db/scan";
import { formatCm } from "@/lib/fit/templates";
import { BODY_FIELDS } from "@/lib/passport/fields";
import { asZone, categoryLabel, measurementChips } from "@/lib/passport/mappers";

export const metadata: Metadata = { title: "Fit Passport" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SAVED: Record<string, string> = {
  measurements: "Measurements saved.",
  garment: "Garment saved.",
  deleted: "Garment deleted.",
  preferences: "Fit notes saved.",
  scan: "Scanned measurements saved.",
  "scan-none": "Nothing ticked, so your passport is unchanged.",
  "scan-deleted": "Scan deleted.",
  "avatar-deleted": "Avatar deleted.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PassportPage({ searchParams }: { searchParams: SearchParams }) {
  const saved = SAVED[first((await searchParams).saved) ?? ""];
  const [{ consent, measurements, references, preferences, status }, avatar] = await Promise.all([
    loadPassport("/passport"),
    hasAvatar("/passport"),
  ]);
  const measured = new Map(measurements.map((m) => [m.name, m]));
  const anyScanned = measurements.some((m) => m.source === "scan");

  return (
    <>
      <TopBanner title="Fit Passport" callout={`Passport ${status.pct}%`} />
      <Eyebrow tint="salmon">Your Fit Passport</Eyebrow>

      <main className="flex flex-col md:flex-row gap-5 p-5 flex-1">
        <div className="md:w-[250px] shrink-0 flex flex-col gap-3">
          {saved && (
            <p role="status" className="border border-ink bg-tint-lime px-3 py-2 font-ui font-bold text-xs">
              {saved}
            </p>
          )}
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
                Your Fit Passport is <b>complete</b>. Listings are compared against your own measurements and garments.
              </>
            )}
          </CtaBlock>
          <div className="border border-ink p-3 font-body text-[13px] leading-[1.4]">
            Your measurements are stored encrypted, never sold, and never sent to AI models.{" "}
            <Link href="/settings">Manage or delete your data</Link>.
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <Card>
            <CardTitleBar>
              <CardTitle>BODY MEASUREMENTS</CardTitle>
              <CardSub>{anyScanned ? "From a tape measure or a photo scan" : "Entered by you with a tape"}</CardSub>
              <span className="flex-1" />
              {consent.granted && (
                <Button size="sm" variant="secondary" href="/passport/measure">
                  Edit
                </Button>
              )}
            </CardTitleBar>
            {consent.granted ? (
              <div className="overflow-x-auto">
                <table className="border-collapse w-full">
                  <thead>
                    <tr className="bg-tint-steel">
                      <th className={TH}>MEASUREMENT</th>
                      <th className={TH}>VALUE</th>
                      <th className={`${TH} hidden sm:table-cell`}>RANGE</th>
                      <th className={TH}>CONFIDENCE</th>
                      <th className={`${TH} hidden sm:table-cell`}>SOURCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BODY_FIELDS.map((field) => {
                      const m = measured.get(field.name);
                      return (
                        <tr key={field.name}>
                          <td className={TD}>{field.label}</td>
                          <td className={`${TD_BOLD} whitespace-nowrap`}>{m ? `${formatCm(m.value_cm)} cm` : "—"}</td>
                          <td className={`${TD} text-[#333] whitespace-nowrap hidden sm:table-cell`}>{m?.range_cm ? `±${formatCm(m.range_cm)} cm` : "—"}</td>
                          <td className={TD}>{m ? <ConfidenceBar pct={m.confidence} /> : <Link href="/passport/measure">Add</Link>}</td>
                          <td className={`${TD} hidden sm:table-cell`}>{m ? <Chip>{m.source === "scan" ? "SCAN" : "TAPE"}</Chip> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-3 font-body text-sm flex flex-col gap-3">
                <p>Before you add body measurements, we&apos;ll explain what we keep and ask for your consent.</p>
                <div>
                  <Button href="/passport/consent?next=/passport/measure">Review and continue</Button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardTitleBar>
              <CardTitle>PHOTO SCAN</CardTitle>
              <CardSub>Optional: estimates from two photos</CardSub>
            </CardTitleBar>
            <div className="px-4 py-3 font-body text-sm flex flex-col gap-3">
              <p>
                Estimate your chest, shoulder width and arm length from a front and a side photo, and see a faceless 3D
                avatar of your body shape. Photos are never stored. A tape measure is still the most accurate.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" href="/passport/scan">
                  {avatar ? "Scan again" : "Scan"}
                </Button>
                {avatar && (
                  <Button size="sm" variant="secondary" href="/passport/avatar">
                    Your avatar
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardTitleBar>
              <CardTitle>REFERENCE GARMENTS — {references.length}</CardTitle>
              <CardSub>Pieces you own; listings are compared against them</CardSub>
            </CardTitleBar>
            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {references.map((r) => (
                <Link
                  key={r.id}
                  href={`/passport/garments/${r.id}`}
                  className={`border border-ink ${FIT_ZONES[asZone(r.fit_zone)].bg} p-3 text-ink no-underline hover:text-ink hover:outline hover:outline-2 hover:outline-ink`}
                >
                  <div className="font-ui font-bold text-sm">{r.title}</div>
                  <div className="font-body text-xs mb-2">
                    {categoryLabel(r.category)}
                    {r.size_label ? ` · size ${r.size_label}` : ""} · fits you {FIT_ZONES[asZone(r.fit_zone)].label.toLowerCase()}
                  </div>
                  <ChipRow chips={measurementChips(r)} />
                </Link>
              ))}
              <Link
                href="/passport/garments/new"
                className="border border-ink border-dashed bg-canvas p-3 flex items-center justify-center font-ui font-bold text-xs text-ink no-underline hover:bg-sticker hover:text-ink min-h-20"
              >
                + ADD A REFERENCE GARMENT
              </Link>
            </div>
          </Card>

          <Card>
            <CardTitleBar>
              <CardTitle>FIT NOTES — WHAT “GOOD FIT” MEANS TO YOU</CardTitle>
              <span className="flex-1" />
              <Button size="sm" variant="secondary" href="/passport/preferences">
                Edit
              </Button>
            </CardTitleBar>
            <div className="bg-tint-lime px-4 py-3 flex flex-col gap-2 font-body text-sm">
              {preferences.length === 0 && <p>No notes yet. Describe how you like each kind of garment to fit.</p>}
              {preferences.map((p) => (
                <div key={p.category} className="flex items-baseline gap-2.5">
                  <span className="font-ui font-bold text-xs bg-canvas border border-ink px-2 py-0.5 shrink-0 uppercase">
                    {categoryLabel(p.category)}
                  </span>
                  <span>{p.text}</span>
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
