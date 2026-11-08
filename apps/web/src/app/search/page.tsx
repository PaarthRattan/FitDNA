import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { ListingCard } from "@/components/listing-card";
import { Button, Eyebrow } from "@/components/ui";
import { SCORE_EXPLAINER } from "@/lib/data";
import { loadSearchListings, type ListingSummary } from "@/lib/db/listings";
import { fitsMe } from "@/lib/fit/score";
import { SearchBar } from "./search-bar";

export const metadata: Metadata = { title: "Search all markets" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function matches(listing: ListingSummary, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${listing.effective.title ?? ""} ${listing.marketplace} ${listing.effective.sizeLabel ?? ""}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = first(params.q)?.trim() ?? "";
  const fitsOnly = first(params.fits) === "1";
  const { configured, signedIn, listings: all, showingDemo } = await loadSearchListings();

  const listings = all
    .filter((l) => !query || matches(l, query))
    .filter((l) => !fitsOnly || fitsMe(l.fit?.prediction?.overall ?? null, l.fit?.score?.score ?? null));
  const best = listings.find((l) => l.fit?.prediction?.overall === "ideal");
  const heading = query ? `“${query}” in your listings` : showingDemo ? "Demo listings" : "Your listings";

  return (
    <>
      <TopBanner title="Search all markets" callout={`${listings.length} listing${listings.length === 1 ? "" : "s"}`} />
      <SearchBar query={query} fitsOnly={fitsOnly} canImport={signedIn} />
      <Eyebrow tint="periwinkle" className="break-words">
        {heading}
      </Eyebrow>

      <main className="p-5 flex flex-col gap-[22px] flex-1">
        {!configured && (
          <div className="border border-ink p-5 font-body text-sm">
            Listings live in the database, which isn&apos;t set up on this server yet. See <code>.env.example</code>.
          </div>
        )}
        {configured && showingDemo && (
          <div className="border border-ink bg-tint-sky p-4 font-body text-sm flex flex-col gap-3">
            <p>
              {signedIn
                ? "These are demo listings. Paste a link to a real listing to see how it would fit you; your own listings replace these."
                : "These are demo listings. Sign in to see how they'd fit you, and to import real listings."}
            </p>
            <div>
              <Button href={signedIn ? "/listings/new" : "/login?next=/search"}>{signedIn ? "Paste a link" : "Sign in"}</Button>
            </div>
          </div>
        )}
        {configured && listings.length === 0 && (
          <div className="border border-ink p-5 font-body text-sm">
            {all.length === 0
              ? "No listings yet."
              : "Nothing matches. Try different words, or turn off the fits-me filter."}
          </div>
        )}
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} best={l === best} />
        ))}
        <p className="font-body text-xs text-[#333] leading-[1.4]">{SCORE_EXPLAINER}</p>
      </main>

      <FooterNav />
    </>
  );
}
