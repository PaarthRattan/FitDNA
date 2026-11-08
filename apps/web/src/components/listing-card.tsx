import { Button, Card, CardTitleBar, ChipRow, ConfidenceSeal, Photo, Sticker } from "@/components/ui";
import { SITE } from "@/lib/data";
import type { ListingSummary } from "@/lib/db/listings";
import { FIT_ZONES } from "@/lib/fit-zones";
import { GAP_MESSAGES, basisNote, formatPrice, listingChips } from "@/lib/listings/labels";
import { marketplaceLabel } from "@/lib/listings/url";

/** Marketplace listing: photo notched left, verdict in the zone tint, seal and actions on the right. */
export function ListingCard({ listing: l, best = false }: { listing: ListingSummary; best?: boolean }) {
  const prediction = l.fit?.prediction ?? null;
  const tint = prediction?.overall ? FIT_ZONES[prediction.overall].bg : "bg-canvas";
  const score = l.fit?.score?.score ?? null;
  const gap = l.fit ? l.fit.gap : "signed_out";
  const title = l.effective.title ?? `Untitled ${marketplaceLabel(l.marketplace)} listing`;

  const actions = (
    <>
      <Button size="sm" href={`/search/${l.id}`}>
        View fit map
      </Button>
      {l.fit && (
        <Button size="sm" variant="secondary" href={`/listings/${l.id}/edit`}>
          Check numbers
        </Button>
      )}
    </>
  );

  return (
    <Card>
      <CardTitleBar className="items-center">
        <span className="font-ui font-bold text-sm">{marketplaceLabel(l.marketplace).toUpperCase()}</span>
        {SITE.showStickers && best && (
          <Sticker rotate={-4} className="self-center">
            BEST FIT!
          </Sticker>
        )}
        <span className="font-body text-[13px] break-words min-w-0">{title}</span>
        <span className="flex-1" />
        <span className="font-ui font-bold text-sm">{formatPrice(l.price, l.currency)}</span>
      </CardTitleBar>

      <div className={`${tint} relative px-4 py-3 sm:pl-[118px] lg:pr-[264px] font-body text-sm leading-[1.45] min-h-[78px] lg:min-h-[96px]`}>
        {prediction ? (
          <>
            <b>{prediction.verdict}</b> {basisNote(l.effective)}
          </>
        ) : (
          <b>{gap ? GAP_MESSAGES[gap] : null}</b>
        )}
        <ChipRow chips={listingChips(l.effective, { sellerRating: l.sellerRating, isDemo: l.isDemo })} className="mt-2" />

        {/* Seal and actions inline below lg; on wide screens, centred in this body (not the whole card, so they never cover the title bar) */}
        <div className="flex items-center gap-4 mt-3 lg:hidden">
          <ConfidenceSeal score={score} />
          <div className="flex flex-col gap-1.5">{actions}</div>
        </div>
        <div className="hidden lg:block absolute right-[152px] top-1/2 -translate-y-1/2">
          <ConfidenceSeal score={score} />
        </div>
        <div className="hidden lg:flex absolute right-3.5 top-1/2 -translate-y-1/2 flex-col gap-1.5 w-[128px]">{actions}</div>
      </div>

      <Photo label="listing photo" className="hidden sm:flex absolute left-3 top-9 -bottom-2 w-[88px] text-[10px] p-1" />
    </Card>
  );
}
