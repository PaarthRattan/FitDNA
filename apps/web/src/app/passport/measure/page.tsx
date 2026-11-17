import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { loadPassport } from "@/lib/db/passport";
import { formatCm } from "@/lib/fit/templates";
import { MeasurementsForm } from "./measurements-form";

export const metadata: Metadata = { title: "Your measurements" };

export default async function MeasurePage() {
  const passport = await loadPassport("/passport/measure");
  if (!passport.consent.granted) redirect("/passport/consent?next=/passport/measure");

  const initial = Object.fromEntries(passport.measurements.map((m) => [m.name, formatCm(m.value_cm)]));
  const scanned = passport.measurements.some((m) => m.source === "scan");

  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="salmon">Your measurements</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>MEASURE WITH A SOFT TAPE</CardTitle>
            <CardSub>Wear a thin top or none. Stand relaxed; don&apos;t pull the tape tight.</CardSub>
          </CardTitleBar>
          <div className="p-4 flex flex-col gap-4">
            {scanned && (
              <p className="border border-ink bg-tint-sky px-3 py-2 font-body text-sm">
                Some of these came from a photo scan. Leave a value as it is to keep it; type a new number to replace it
                with your tape measurement.
              </p>
            )}
            <MeasurementsForm initial={initial} />
          </div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
