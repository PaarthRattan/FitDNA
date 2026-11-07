import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <TopBanner title="Settings" />
      <Eyebrow tint="salmon">Settings</Eyebrow>
      <main className="p-5 flex-1">
        <div className="border border-ink p-5 font-body text-sm max-w-xl">
          Manage consent, scan retention, and your data. Raw scan photos are deleted immediately after processing; you can delete everything else at any time.
          <div className="mt-3">
            <Button href="/">Back to wardrobe</Button>
          </div>
        </div>
      </main>
      <FooterNav />
    </>
  );
}
