import type { Metadata } from "next";
import { after } from "next/server";
import type { ReactNode } from "react";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { requireUser } from "@/lib/db/auth";
import { loadConsent } from "@/lib/db/passport";
import { AVAILABILITY_MESSAGES, scanAvailability } from "@/lib/scan/access";
import { warmScanService } from "@/lib/scan/client";
import { SCAN_DAILY_CAP } from "@/lib/scan/constants";
import { ScanCapture } from "./scan-capture";

export const metadata: Metadata = { title: "Photo scan" };

/**
 * The photo scan: gates first (switched on, region, both consents), then the capture
 * form. Opening the form wakes the scan service, so a GPU cold start overlaps with the
 * user taking photos.
 */
export default async function ScanPage() {
  const user = await requireUser("/passport/scan");
  const [availability, dataConsent, scanConsent] = await Promise.all([
    scanAvailability(user.id),
    loadConsent("/passport/scan", "data"),
    loadConsent("/passport/scan", "scan"),
  ]);

  if (availability !== "ok") {
    return (
      <Shell sub="Not available">
        <p>{AVAILABILITY_MESSAGES[availability]}</p>
        <div className="flex gap-2 flex-wrap">
          <Button href="/passport/measure">Measure with a tape</Button>
          <Button href="/passport" variant="secondary">
            Back to your passport
          </Button>
        </div>
      </Shell>
    );
  }

  if (!dataConsent.granted || !scanConsent.granted) {
    const href = dataConsent.granted ? "/passport/scan/consent" : "/passport/consent?next=/passport/scan/consent";
    return (
      <Shell sub="Consent first">
        <p>
          A photo scan estimates your chest, shoulder width and arm length from two photos and your height, and makes a
          faceless 3D avatar of your body shape. Before you start, we&apos;ll explain what happens to the photos and what
          we keep{dataConsent.granted ? "" : ", starting with your body measurements"}.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button href={href}>Review and continue</Button>
          <Button href="/passport/measure" variant="secondary">
            Measure with a tape instead
          </Button>
        </div>
      </Shell>
    );
  }

  after(() => warmScanService());

  return (
    <Shell sub="Two photos and your height">
      <ScanCapture />
      <p className="text-xs text-[#333] leading-[1.4] border-t border-ink pt-3">
        Up to {SCAN_DAILY_CAP} scans a day. The results are estimates with a range; you choose which ones to use, and a
        tape measure is still the most reliable.
      </p>
    </Shell>
  );
}

function Shell({ sub, children }: { sub: string; children: ReactNode }) {
  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="salmon">Photo scan</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>SCAN YOUR MEASUREMENTS</CardTitle>
            <CardSub>{sub}</CardSub>
          </CardTitleBar>
          <div className="p-4 flex flex-col gap-4 font-body text-sm leading-[1.45]">{children}</div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
