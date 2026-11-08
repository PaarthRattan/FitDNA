import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Card, CardSub, CardTitle, CardTitleBar, ChipRow, Eyebrow } from "@/components/ui";
import { loadPurchase } from "@/lib/db/feedback";
import { FIT_ZONES } from "@/lib/fit-zones";
import { FIT_PARTS } from "@/lib/fit/constants";
import { PART_LABELS } from "@/lib/listings/labels";
import { marketplaceLabel } from "@/lib/listings/url";
import { FeedbackForm } from "../feedback-form";

export const metadata: Metadata = { title: "How did it fit?" };

type Params = Promise<{ id: string }>;

export default async function FitCheckPage({ params }: { params: Params }) {
  const { id } = await params;
  const purchase = await loadPurchase(id);
  if (!purchase) notFound();

  const predicted = purchase.predicted;
  const chips = FIT_PARTS.flatMap((part) => (predicted.parts[part] ? [`${PART_LABELS[part].toUpperCase()}: ${FIT_ZONES[predicted.parts[part]!].label}`] : []));
  const f = purchase.feedback;

  return (
    <>
      <TopBanner title="Fit feedback" />
      <Eyebrow tint="lime">How did it fit?</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>{marketplaceLabel(purchase.marketplace).toUpperCase()}</CardTitle>
            <CardSub>
              {purchase.title ?? "Untitled listing"}
              {purchase.sizeLabel ? ` · size ${purchase.sizeLabel}` : ""}
            </CardSub>
          </CardTitleBar>
          <div className={`${predicted.overall ? FIT_ZONES[predicted.overall].bg : "bg-canvas"} border-b border-ink px-4 py-3 font-body text-sm`}>
            We predicted: <b>{predicted.verdict ?? (predicted.overall ? FIT_ZONES[predicted.overall].label : "nothing")}</b>
            {chips.length > 0 && <ChipRow chips={chips} className="mt-2" />}
          </div>
          <div className="p-4 flex flex-col gap-3">
            <p className="font-body text-sm">
              Try it on the way you&apos;d wear it. Answer against your own idea of the perfect fit, as you did for your
              reference garments.
            </p>
            <FeedbackForm
              initial={{
                id: purchase.id,
                overall: f?.overall ?? "",
                chest: f?.parts.chest ?? "",
                shoulder: f?.parts.shoulder ?? "",
                length: f?.parts.length ?? "",
                sleeve: f?.parts.sleeve ?? "",
                kept: f?.kept === true ? "yes" : f?.kept === false ? "no" : "",
              }}
            />
          </div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
