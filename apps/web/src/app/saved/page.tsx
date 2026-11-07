import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Saved" };

export default function Page() {
  return (
    <>
      <TopBanner title="Saved" />
      <Eyebrow tint="sage">Saved</Eyebrow>
      <main className="p-5 flex-1">
        <div className="border border-ink p-5 font-body text-sm max-w-xl">
          Listings you save from any marketplace will collect here with their latest Purchase Confidence Score.
          <div className="mt-3">
            <Button href="/">Back to wardrobe</Button>
          </div>
        </div>
      </main>
      <FooterNav />
    </>
  );
}
