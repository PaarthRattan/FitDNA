import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardSub, CardTitle, CardTitleBar, ConfidenceBar, Eyebrow, TD, TD_BOLD, TH } from "@/components/ui";
import { loadPassport } from "@/lib/db/passport";
import { hasAvatar, loadScan } from "@/lib/db/scan";
import { formatCm } from "@/lib/fit/templates";
import { BODY_FIELDS } from "@/lib/passport/fields";
import { SCAN_MESSAGES } from "@/lib/scan/status";
import { applyScan, deleteScan } from "../../actions";
import { ScanProgress } from "./scan-progress";

export const metadata: Metadata = { title: "Your scan" };

type Params = Promise<{ id: string }>;

/**
 * One scan: progress while it runs, what went wrong if it failed, and the results when
 * it's done. Results never go into the passport by themselves: the user ticks the
 * values to use. Shoulder and arm start ticked; chest only when there's no tape value,
 * because a tape is still the better chest measurement.
 */
export default async function ScanResultPage({ params }: { params: Params }) {
  const { id } = await params;
  const scan = await loadScan(id);
  if (!scan) notFound();

  if (scan.state.state === "working") {
    return (
      <Shell sub="Working">
        <ScanProgress />
      </Shell>
    );
  }

  if (scan.state.state === "failed") {
    return (
      <Shell sub="No measurements this time">
        <p>{SCAN_MESSAGES[scan.state.error]}</p>
        <div className="flex gap-2 flex-wrap">
          <Button href="/passport/scan">Try again</Button>
          <Button href="/passport/measure" variant="secondary">
            Measure with a tape
          </Button>
        </div>
        <DeleteScan id={scan.id} />
      </Shell>
    );
  }

  const [passport, avatar] = await Promise.all([loadPassport(`/passport/scan/${scan.id}`), hasAvatar(`/passport/scan/${scan.id}`)]);
  const current = new Map(passport.measurements.map((m) => [m.name, m]));
  const results = scan.result?.measurements ?? {};
  const flags = new Set([...(scan.result?.flags ?? []), ...Object.values(results).flatMap((m) => m?.flags ?? [])]);
  const disagreements = BODY_FIELDS.flatMap((f) => {
    const m = results[f.name];
    return m?.flags.includes("views_disagree") && m.disagreement_cm !== null ? [`${f.label.toLowerCase()} by ${formatCm(m.disagreement_cm)} cm`] : [];
  });

  return (
    <Shell sub={`Height ${formatCm(scan.heightCm)} cm`}>
      <form action={applyScan} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={scan.id} />
        <div className="overflow-x-auto border border-ink">
          <table className="border-collapse w-full">
            <thead>
              <tr className="bg-tint-steel">
                <th className={TH}>USE</th>
                <th className={TH}>MEASUREMENT</th>
                <th className={TH}>SCAN</th>
                <th className={`${TH} hidden sm:table-cell`}>CONFIDENCE</th>
                <th className={TH}>NOW</th>
              </tr>
            </thead>
            <tbody>
              {BODY_FIELDS.map((field) => {
                const m = results[field.name];
                const now = current.get(field.name);
                const ticked = field.name === "chest" ? !now || now.source === "scan" : true;
                return (
                  <tr key={field.name}>
                    <td className={TD}>
                      {m ? (
                        <input
                          type="checkbox"
                          name="use"
                          value={field.name}
                          defaultChecked={ticked}
                          aria-label={`Use the scanned ${field.label.toLowerCase()}`}
                          className="accent-ink w-4 h-4"
                        />
                      ) : null}
                    </td>
                    <td className={TD}>{field.label}</td>
                    <td className={`${TD_BOLD} whitespace-nowrap`}>
                      {m ? (
                        <>
                          {formatCm(m.value_cm)} cm <span className="font-body font-normal text-[#333]">±{formatCm(m.range_cm)}</span>
                        </>
                      ) : (
                        "Not measured"
                      )}
                    </td>
                    <td className={`${TD} hidden sm:table-cell`}>{m ? <ConfidenceBar pct={m.confidence} /> : "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {now ? `${formatCm(now.value_cm)} cm (${now.source === "scan" ? "scan" : "tape"})` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="flex flex-col gap-1.5 list-disc pl-5">
          {flags.has("unvalidated") && (
            <li>
              These are estimates. The scan hasn&apos;t been checked against tape measurements on real people yet, so each value
              carries a range and less confidence than a tape measurement.
            </li>
          )}
          {flags.has("loose_clothing") && <li>Your clothing looked loose, which makes the chest estimate less certain.</li>}
          {disagreements.length > 0 && (
            <li>The front and side photos disagreed on {disagreements.join(" and ")}; the ranges include that.</li>
          )}
          <li>
            Ticked values replace what&apos;s in your passport now. You can change them any time on the measurements page.
          </li>
        </ul>

        <div className="flex gap-2 flex-wrap">
          <Button type="submit">Use the ticked values</Button>
          <Button href="/passport" variant="secondary">
            Keep what I have
          </Button>
          {avatar && (
            <Button href="/passport/avatar" variant="secondary">
              See your avatar
            </Button>
          )}
        </div>
      </form>
      <DeleteScan id={scan.id} />
    </Shell>
  );
}

function DeleteScan({ id }: { id: string }) {
  return (
    <form action={deleteScan} className="border-t border-ink pt-3 flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-[#333]">
        Deleting this scan also deletes its avatar. Measurements you&apos;ve already used stay in your passport until you
        change them.
      </p>
      <div>
        <Button type="submit" variant="secondary" size="sm">
          Delete this scan
        </Button>
      </div>
    </form>
  );
}

function Shell({ sub, children }: { sub: string; children: ReactNode }) {
  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="salmon">Your scan</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>SCAN RESULTS</CardTitle>
            <CardSub>{sub}</CardSub>
          </CardTitleBar>
          <div className="p-4 flex flex-col gap-4 font-body text-sm leading-[1.45]">{children}</div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
