import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardTitleBar, ChipRow, ConfidenceSeal, Eyebrow, Photo, Sticker } from "@/components/ui";
import { DEFAULT_QUERY, DEFAULT_RESULT_TITLE, LISTINGS, SCORE_EXPLAINER, SITE, fitsMe, type Listing } from "@/lib/data";
import { FIT_ZONES } from "@/lib/fit-zones";
import { SearchBar } from "./search-bar";

export const metadata: Metadata = { title: "Search all markets" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = first(params.q)?.trim() || DEFAULT_QUERY;
  const fitsOnly = first(params.fits) === "1";

  const listings = fitsOnly ? LISTINGS.filter(fitsMe) : LISTINGS;
  const heading = first(params.q)?.trim() ? `${query} — all markets` : DEFAULT_RESULT_TITLE;

  return (
    <>
      <TopBanner title="Search all markets" callout={`${listings.length} listing${listings.length === 1 ? "" : "s"} found`} />
      <SearchBar query={query} fitsOnly={fitsOnly} />
      <Eyebrow tint="periwinkle" className="break-words">
        {heading}
      </Eyebrow>

      <main className="p-5 flex flex-col gap-[22px] flex-1">
        {listings.length === 0 && (
          <div className="border border-ink p-5 font-body text-sm">
            Nothing in your fit range for this search. Try widening the size, or turn off the fits-me filter.
          </div>
        )}
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
        <p className="font-body text-xs text-[#333] leading-[1.4]">{SCORE_EXPLAINER}</p>
      </main>

      <FooterNav />
    </>
  );
}

/** Marketplace listing: photo notched left, verdict in the tint body, seal + actions on the right. */
function ListingCard({ listing: l }: { listing: Listing }) {
  const zone = FIT_ZONES[l.zone];
  return (
    <Card>
      <CardTitleBar className="items-center">
        <span className="font-ui font-bold text-sm">{l.market}</span>
        {SITE.showStickers && l.best && (
          <Sticker rotate={-4} className="self-center">
            BEST FIT!
          </Sticker>
        )}
        <span className="font-body text-[13px]">{l.title}</span>
        <span className="flex-1" />
        <span className="font-ui font-bold text-sm">{l.price}</span>
      </CardTitleBar>

      <div className={`${zone.bg} px-4 py-3 sm:pl-[118px] lg:pr-[236px] font-body text-sm leading-[1.45] min-h-[78px]`}>
        <b>{l.verdict}</b> {l.body}
        <ChipRow chips={l.chips} className="mt-2" />

        {/* Seal and actions inline below lg; absolutely positioned on wide screens */}
        <div className="flex items-center gap-4 mt-3 lg:hidden">
          <ConfidenceSeal score={l.score} />
          <div className="flex flex-col gap-1.5">
            <Button size="sm" href={`/search/${l.id}`}>
              View fit map
            </Button>
            <Button size="sm" variant="secondary" href="/alerts">
              Track price
            </Button>
          </div>
        </div>
      </div>

      <Photo label="listing photo" className="hidden sm:flex absolute left-3 top-9 -bottom-2 w-[88px] text-[10px] p-1" />
      <div className="hidden lg:block absolute right-[124px] top-1/2 -translate-y-[42%]">
        <ConfidenceSeal score={l.score} />
      </div>
      <div className="hidden lg:flex absolute right-3.5 top-1/2 -translate-y-1/2 flex-col gap-1.5 w-[100px]">
        <Button size="sm" href={`/search/${l.id}`}>
          View fit map
        </Button>
        <Button size="sm" variant="secondary" href="/alerts">
          Track price
        </Button>
      </div>
    </Card>
  );
}
