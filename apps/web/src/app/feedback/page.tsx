import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Fit feedback" };

export default function Page() {
  return (
    <>
      <TopBanner title="Fit feedback" />
      <Eyebrow tint="lime">Fit feedback</Eyebrow>
      <main className="p-5 flex-1">
        <div className="border border-ink p-5 font-body text-sm max-w-xl">
          After a purchase arrives, file a two-minute fit check. Every answer sharpens predictions across all your references.
          <div className="mt-3">
            <Button href="/">Back to wardrobe</Button>
          </div>
        </div>
      </main>
      <FooterNav />
    </>
  );
}
