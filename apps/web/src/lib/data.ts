/* ------------------------------------------------------------------ */
/* Site config and navigation. All user and listing data is read from */
/* the database through src/lib/db/.                                   */
/* ------------------------------------------------------------------ */

export const SITE = {
  name: "FitDNA",
  tagline: "KNOW YOUR FIT. BEFORE YOU BUY.",
  showStickers: true,
} as const;

export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "WARDROBE", href: "/" },
  { label: "FIT PASSPORT", href: "/passport" },
  { label: "SEARCH", href: "/search" },
  { label: "SAVED", href: "/saved" },
  { label: "PRICE ALERTS", href: "/alerts" },
  { label: "FEEDBACK", href: "/feedback" },
  { label: "EXTENSION", href: "/extension" },
  { label: "SETTINGS", href: "/settings" },
];

export const FOOTER_ITEMS: NavItem[] = [
  { label: "WARDROBE", href: "/" },
  { label: "FIT PASSPORT", href: "/passport" },
  { label: "SEARCH MARKETS", href: "/search" },
  { label: "FEEDBACK", href: "/feedback" },
];

/** What the Purchase Confidence Score is made of, as it stands today. */
export const SCORE_EXPLAINER =
  "Purchase Confidence Score blends the predicted fit (from your Fit Passport and the listing's measurements) with the listing's condition and the seller's rating, when they're known. Price history isn't counted yet: it needs more price observations first. Predictions will improve as post-purchase fit feedback comes in.";
