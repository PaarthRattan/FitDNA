import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { loadConsent } from "@/lib/db/passport";
import { safeNext } from "@/lib/safe-next";
import { grantConsent, withdrawConsent } from "../actions";

export const metadata: Metadata = { title: "Consent for body measurements" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** What we ask agreement to. Change CONSENT_POLICY_VERSION whenever this text changes. */
const TERMS: Array<[string, string]> = [
  [
    "What we keep",
    "Three body measurements: chest, shoulder width and arm length, typed in by you or, if you choose, taken from a photo scan. Nothing else about your body.",
  ],
  ["Why", "Only to predict how garments will fit you. We don't use them for anything else, and we never sell them."],
  [
    "Who handles them",
    "They're stored with Supabase, our database provider, encrypted at rest and in transit. They're never sent to AI models or shared with marketplaces.",
  ],
  [
    "How long, and how to stop",
    "Until you remove them. Change or delete them any time, withdraw this consent (which deletes them), or delete your whole account from Settings.",
  ],
  [
    "Photo scans",
    "Optional. A scan asks for its own consent first, which explains where the photos go and what it keeps. Withdrawing this consent also deletes everything from scans.",
  ],
];

export default async function ConsentPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext(first((await searchParams).next), "/passport/measure");
  const consent = await loadConsent(`/passport/consent?next=${encodeURIComponent(next)}`);

  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="salmon">Your body data</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>BEFORE YOU ADD BODY MEASUREMENTS</CardTitle>
          </CardTitleBar>
          <div className="p-4 flex flex-col gap-4 font-body text-sm leading-[1.45]">
            <dl className="flex flex-col gap-3">
              {TERMS.map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-ui font-bold text-xs uppercase">{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>

            {consent.granted ? (
              <div className="flex flex-col gap-3 border-t border-ink pt-4">
                <p>
                  You agreed on <b>{formatDate(consent.at)}</b>.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button href={next}>Continue</Button>
                  <form action={withdrawConsent}>
                    <Button type="submit" variant="secondary">
                      Withdraw and delete my measurements
                    </Button>
                  </form>
                </div>
              </div>
            ) : (
              <form action={grantConsent} className="flex gap-2 flex-wrap border-t border-ink pt-4">
                <input type="hidden" name="next" value={next} />
                <Button type="submit">I agree</Button>
                <Button href="/passport" variant="secondary">
                  Not now
                </Button>
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
