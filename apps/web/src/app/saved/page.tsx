import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { ListingCard } from "@/components/listing-card";
import { Button, Eyebrow } from "@/components/ui";
import { loadSavedListings } from "@/lib/db/listings";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  const listings = await loadSavedListings();
  return (
    <>
      <TopBanner title="Saved" callout={`${listings.length} saved`} />
      <Eyebrow tint="sage">Saved</Eyebrow>
      <main className="p-5 flex-1 flex flex-col gap-[22px]">
        {listings.length === 0 ? (
          <div className="border border-ink p-5 font-body text-sm max-w-xl flex flex-col gap-3">
            <p>Listings you save collect here, with their prediction worked out again from your current Fit Passport.</p>
            <div className="flex gap-2 flex-wrap">
              <Button href="/listings/new">Paste a link</Button>
              <Button href="/search" variant="secondary">
                Your listings
              </Button>
            </div>
          </div>
        ) : (
          listings.map((l) => <ListingCard key={l.id} listing={l} />)
        )}
      </main>
      <FooterNav />
    </>
  );
}
