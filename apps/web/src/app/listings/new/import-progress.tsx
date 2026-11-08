"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

const POLL_MS = 2000;
/** A little longer than the server's own cut-off, which turns a stuck import into a timeout. */
const GIVE_UP_MS = 90_000;

/**
 * Re-renders the page every two seconds while the import runs. The server page
 * redirects to the confirm form as soon as the import has an outcome.
 */
export function ImportProgress({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [router]);

  if (gaveUp) {
    return (
      <div className="flex flex-col gap-3">
        <p>This is taking much longer than it should. You can enter the measurements yourself instead.</p>
        <div>
          <Button href={`/listings/${listingId}/edit?fetch=timeout`}>Enter them myself</Button>
        </div>
      </div>
    );
  }
  return (
    <p role="status" aria-live="polite">
      Reading the listing… This usually takes a few seconds. You&apos;ll go straight to the numbers when it&apos;s done.
    </p>
  );
}
