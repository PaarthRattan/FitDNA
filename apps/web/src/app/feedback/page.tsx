import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardSub, CardTitle, CardTitleBar, ChipRow, Eyebrow } from "@/components/ui";
import { loadPurchases, type PurchaseWithFeedback } from "@/lib/db/feedback";
import { agreementSummary, describeComparison } from "@/lib/feedback/feedback";
import { FIT_ZONES } from "@/lib/fit-zones";
import { FIT_PARTS } from "@/lib/fit/constants";
import { PART_LABELS } from "@/lib/listings/labels";
import { marketplaceLabel } from "@/lib/listings/url";

export const metadata: Metadata = { title: "Fit feedback" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  const saved = (await searchParams).saved === "1";
  const purchases = await loadPurchases();
  const waiting = purchases.filter((p) => !p.feedback).length;
  const summary = agreementSummary(purchases.map((p) => ({ predicted: p.predicted.overall, actual: p.feedback?.overall ?? null })));

  return (
    <>
      <TopBanner title="Fit feedback" callout={waiting ? `${waiting} to check` : undefined} />
      <Eyebrow tint="lime">Fit checks</Eyebrow>
      <main className="p-5 flex-1 flex flex-col gap-4">
        {saved && (
          <p role="status" className="border border-ink bg-tint-lime px-3 py-2 font-ui font-bold text-xs max-w-2xl">
            Fit check saved. Thanks: every answer is compared with what was predicted.
          </p>
        )}
        {purchases.length === 0 ? (
          <div className="border border-ink p-5 font-body text-sm max-w-xl flex flex-col gap-3">
            <p>
              When you buy something you checked here, mark it &ldquo;I bought this&rdquo; on its fit map. Once it arrives, say
              how it fits: each answer is compared with the prediction and makes the next ones better.
            </p>
            <div>
              <Button href="/search">Your listings</Button>
            </div>
          </div>
        ) : (
          <>
            {summary.answered > 0 && (
              <p className="border border-ink px-3 py-2 font-body text-sm max-w-2xl">
                Predictions matched <b>{summary.match}</b> of {summary.answered} fit check{summary.answered === 1 ? "" : "s"}
                {summary.close > 0 && <>; {summary.close} {summary.close === 1 ? "was" : "were"} one step off</>}
                {summary.off > 0 && <>; {summary.off} {summary.off === 1 ? "was" : "were"} further off</>}.
              </p>
            )}
            {purchases.map((p) => (
              <PurchaseCard key={p.id} purchase={p} />
            ))}
          </>
        )}
      </main>
      <FooterNav />
    </>
  );
}

function PurchaseCard({ purchase: p }: { purchase: PurchaseWithFeedback }) {
  const predicted = p.predicted.overall;
  const actual = p.feedback?.overall ?? null;
  const tint = actual ? FIT_ZONES[actual].bg : predicted ? FIT_ZONES[predicted].bg : "bg-canvas";
  const partChips = p.feedback
    ? FIT_PARTS.flatMap((part) => {
        const said = p.feedback!.parts[part];
        const was = p.predicted.parts[part];
        return said ? [`${PART_LABELS[part].toUpperCase()}: ${was ? `${FIT_ZONES[was].label} → ` : ""}${FIT_ZONES[said].label}`] : [];
      })
    : [];
  const bought = new Date(p.purchasedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  return (
    <Card className="max-w-3xl">
      <CardTitleBar>
        <CardTitle>{marketplaceLabel(p.marketplace).toUpperCase()}</CardTitle>
        <CardSub>
          {p.title ?? "Untitled listing"} · bought {bought}
          {p.sizeLabel ? ` · size ${p.sizeLabel}` : ""}
        </CardSub>
      </CardTitleBar>
      <div className={`${tint} px-4 py-3 font-body text-sm leading-[1.45] flex flex-col gap-2`}>
        <p>
          {/* The verdict already starts with the zone ("Relaxed — 4 cm wider…"). */}
          Predicted: <b>{p.predicted.verdict ?? (predicted ? FIT_ZONES[predicted].label : "no prediction")}</b>
        </p>
        {p.feedback ? (
          <p>
            You said: <b>{FIT_ZONES[p.feedback.overall].label}</b>. {describeComparison(predicted, actual)}.
            {p.feedback.kept === true && " You kept it."}
            {p.feedback.kept === false && " You're not keeping it."}
          </p>
        ) : (
          <p>How did it fit? It takes a few seconds.</p>
        )}
        {partChips.length > 0 && <ChipRow chips={partChips} />}
        <div>
          <Button size="sm" href={`/feedback/${p.id}`} variant={p.feedback ? "secondary" : "primary"}>
            {p.feedback ? "Change your answer" : "How did it fit?"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
