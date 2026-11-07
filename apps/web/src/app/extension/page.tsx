import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Browser extension" };

export default function Page() {
  return (
    <>
      <TopBanner title="Browser extension" />
      <Eyebrow tint="steel">Browser extension</Eyebrow>
      <main className="p-5 flex-1">
        <div className="border border-ink p-5 font-body text-sm max-w-xl">
          The FitDNA extension reads the retailer page you are on and shows a size recommendation, confidence and a written fit explanation.
          <div className="mt-3">
            <Button href="/">Back to wardrobe</Button>
          </div>
        </div>
      </main>
      <FooterNav />
    </>
  );
}
