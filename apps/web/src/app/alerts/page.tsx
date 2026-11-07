import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Price alerts" };

export default function Page() {
  return (
    <>
      <TopBanner title="Price alerts" />
      <Eyebrow tint="peach">Price alerts</Eyebrow>
      <main className="p-5 flex-1">
        <div className="border border-ink p-5 font-body text-sm max-w-xl">
          Track a listing and FitDNA will watch its price against the 90-day history for that style and size.
          <div className="mt-3">
            <Button href="/">Back to wardrobe</Button>
          </div>
        </div>
      </main>
      <FooterNav />
    </>
  );
}
