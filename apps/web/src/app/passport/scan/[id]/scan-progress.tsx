"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { SCAN_STALE_SECONDS } from "@/lib/scan/constants";

const POLL_MS = 3000;
/** A little longer than the server's own cut-off, which turns a stuck scan into a timeout. */
const GIVE_UP_MS = (SCAN_STALE_SECONDS + 30) * 1000;

/** Re-renders the page every few seconds while the scan runs; the page shows the result when there is one. */
export function ScanProgress() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      if (elapsed > GIVE_UP_MS) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      setSeconds(Math.round(elapsed / 1000));
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [router]);

  if (gaveUp) {
    return (
      <div className="flex flex-col gap-3">
        <p>This is taking much longer than it should. Try again later, or enter your measurements with a tape.</p>
        <div className="flex gap-2 flex-wrap">
          <Button href="/passport/scan">Try again</Button>
          <Button href="/passport/measure" variant="secondary">
            Measure with a tape
          </Button>
        </div>
      </div>
    );
  }
  return (
    <p role="status" aria-live="polite">
      Scanning… This usually takes a minute or two, a little longer if the scanner was asleep. Your photos are being
      processed in memory and will be discarded when it&apos;s done. {seconds > 0 && <span className="text-[#333]">({seconds} s)</span>}
    </p>
  );
}
