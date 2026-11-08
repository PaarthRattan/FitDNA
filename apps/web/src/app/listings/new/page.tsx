import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { requireUser } from "@/lib/db/auth";
import { loadImport } from "@/lib/db/listings";
import { IMPORT_DAILY_CAP } from "@/lib/listings/constants";
import { ImportForm } from "./import-form";
import { ImportProgress } from "./import-progress";

export const metadata: Metadata = { title: "Import a listing" };

/**
 * Seconds. Also the limit for this page's Server Actions, so the import started by
 * `startImport` (which runs after its response, via `after`) has time to finish.
 * Must be a literal for Next to read it.
 */
export const maxDuration = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewListingPage({ searchParams }: { searchParams: SearchParams }) {
  const importId = first((await searchParams).import);
  await requireUser(importId ? `/listings/new?import=${encodeURIComponent(importId)}` : "/listings/new");

  if (importId) {
    const job = await loadImport(importId);
    if (!job) notFound();
    if (job.state === "done") redirect(`/listings/${job.listingId}/edit?fetch=done`);
    if (job.state === "failed") redirect(`/listings/${job.listingId}/edit?fetch=${job.error}`);
    return (
      <Shell>
        <ImportProgress listingId={job.listingId} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-4">
        <p>
          Paste the link to a top or jacket you&apos;re thinking of buying. FitDNA reads the seller&apos;s measurements, you
          check them, and you see how it should fit you.
        </p>
        <ImportForm />
        <p className="text-xs text-[#333] leading-[1.4]">
          We fetch the page with Firecrawl, our page-reading service, and keep the listing&apos;s details, not the page
          itself. If our own rules can&apos;t find every measurement, the listing&apos;s text (with names and contact
          details removed) is also read by DeepSeek&apos;s AI model. Neither ever receives anything about you. Up to{" "}
          {IMPORT_DAILY_CAP} links a day.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBanner title="Search all markets" />
      <Eyebrow tint="periwinkle">Import a listing</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>PASTE A LINK</CardTitle>
            <CardSub>eBay, Grailed, Poshmark, Mercari, Depop or Vinted</CardSub>
          </CardTitleBar>
          <div className="p-4 font-body text-sm leading-[1.45]">{children}</div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
