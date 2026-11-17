import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { loadConsent } from "@/lib/db/passport";
import { SCAN_CONSENT_TERMS } from "@/lib/scan/consent";
import { grantScanConsent, withdrawScanConsent } from "../../actions";

export const metadata: Metadata = { title: "Consent for photo scans" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The photo-scan consent: separate from the body-data consent (which comes first), with
 * its own unticked box. The text is SCAN_CONSENT_TERMS; changing it means bumping
 * SCAN_CONSENT_POLICY_VERSION.
 */
export default async function ScanConsentPage({ searchParams }: { searchParams: SearchParams }) {
  const missing = (await searchParams).missing;
  const [dataConsent, scanConsent] = await Promise.all([
    loadConsent("/passport/scan/consent", "data"),
    loadConsent("/passport/scan/consent", "scan"),
  ]);
  if (!dataConsent.granted) redirect("/passport/consent?next=/passport/scan/consent");

  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="salmon">Photo scans</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>BEFORE YOU SCAN</CardTitle>
          </CardTitleBar>
          <div className="p-4 flex flex-col gap-4 font-body text-sm leading-[1.45]">
            <dl className="flex flex-col gap-3">
              {SCAN_CONSENT_TERMS.map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-ui font-bold text-xs uppercase">{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>

            {scanConsent.granted ? (
              <div className="flex flex-col gap-3 border-t border-ink pt-4">
                <p>
                  You agreed on <b>{formatDate(scanConsent.at)}</b>.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button href="/passport/scan">Continue</Button>
                  <form action={withdrawScanConsent}>
                    <Button type="submit" variant="secondary">
                      Withdraw and delete my scans
                    </Button>
                  </form>
                </div>
              </div>
            ) : (
              <form action={grantScanConsent} className="flex flex-col gap-3 border-t border-ink pt-4">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="agree"
                    value="yes"
                    required
                    className="mt-1 accent-ink"
                    aria-describedby={missing === "agree" ? "agree-error" : undefined}
                  />
                  <span>I&apos;ve read this. I&apos;m 18 or older, and I agree to photo scans as described.</span>
                </label>
                {missing === "agree" && (
                  <p id="agree-error" role="alert" className="font-body text-xs text-primary font-bold">
                    Tick the box to agree, or choose &ldquo;Not now&rdquo;.
                  </p>
                )}
                {missing === "later" && (
                  <p role="alert" className="font-body text-xs text-primary font-bold">
                    You&apos;ve agreed to photo scans several times in the last 24 hours. Try again tomorrow.
                  </p>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button type="submit">I agree</Button>
                  <Button href="/passport" variant="secondary">
                    Not now
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "an earlier visit";
}
