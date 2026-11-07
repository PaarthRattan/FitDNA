"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FOOTER_ITEMS, NAV_ITEMS, SITE } from "@/lib/data";
import { FIT_ZONES, FIT_ZONE_ORDER } from "@/lib/fit-zones";

/** Black top banner: wordmark, section title, optional sticker, red callout. */
export function TopBanner({
  title,
  callout,
  sticker,
}: {
  title: string;
  callout?: ReactNode;
  sticker?: ReactNode;
}) {
  return (
    <header className="bg-ink text-canvas px-4 py-3 flex items-center gap-4 flex-wrap">
      <Link href="/" className="font-display font-black text-2xl leading-none text-canvas hover:text-canvas no-underline">
        {SITE.name}
      </Link>
      <div className="font-ui font-bold text-[13px] tracking-[.02em] uppercase">{title}</div>
      <div className="flex-1" />
      {SITE.showStickers && sticker}
      {callout && <div className="text-primary font-ui font-bold text-base uppercase whitespace-nowrap">{callout}</div>}
    </header>
  );
}

/** "SCAN a GARMENT" sticker with the purple stripe on the lowercase "a". */
export function ScanSticker() {
  return (
    <Link
      href="/passport"
      className="bg-sticker text-ink border border-ink font-ui font-bold text-xs px-2.5 py-[5px] shadow-hard-grey no-underline hover:text-ink"
    >
      SCAN <span className="bg-stripe text-canvas px-[3px]">a</span> GARMENT
    </Link>
  );
}

/** 2×4 icon-label nav grid for the left rail. Active route is sticker yellow. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="grid grid-cols-2 border border-ink">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`border border-ink -m-px px-1.5 py-3 text-center font-ui font-bold text-[11px] no-underline text-ink hover:bg-primary hover:text-canvas ${
              active ? "bg-sticker" : "bg-canvas"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function FitZoneLegend() {
  return (
    <div className="border border-ink px-3 py-2.5 font-body text-xs leading-[1.5]">
      <div className="font-ui font-bold text-[11px] mb-1.5">FIT-ZONE LEGEND</div>
      {FIT_ZONE_ORDER.map((zone) => (
        <div key={zone} className="flex items-center gap-2 my-0.5">
          <span className={`w-3.5 h-3.5 border border-ink inline-block ${FIT_ZONES[zone].bg}`} />
          {FIT_ZONES[zone].legend}
        </div>
      ))}
    </div>
  );
}

export function FooterNav() {
  return (
    <footer className="border-t border-ink px-4 py-3 flex gap-4 sm:gap-10 justify-center flex-wrap font-ui font-bold text-[11px]">
      {FOOTER_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="text-ink no-underline hover:text-primary">
          {item.label}
        </Link>
      ))}
    </footer>
  );
}
