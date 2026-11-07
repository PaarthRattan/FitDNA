"use client";

import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Eyebrow } from "@/components/ui";

/** Shown when a page fails to load its data, e.g. the database is unreachable. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <TopBanner title="Something went wrong" />
      <Eyebrow tint="salmon">Something went wrong</Eyebrow>
      <main className="p-5 flex-1">
        <div className="border border-ink p-5 font-body text-sm max-w-xl flex flex-col gap-3">
          <p>This page couldn&apos;t load. Try again in a moment.</p>
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button href="/" variant="secondary">
              Back to wardrobe
            </Button>
          </div>
        </div>
      </main>
      <FooterNav />
    </>
  );
}
