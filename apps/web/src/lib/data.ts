import type { FitZone } from "./fit-zones";

/* ------------------------------------------------------------------ */
/* Site config and navigation, plus mock listings for search and the  */
/* fit map until listings move to the database (M4a). The Fit Passport */
/* and wardrobe read real data through src/lib/db/.                    */
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

/* ---------- Fit map (mock until listings move to the database) ---------- */

export interface Measurement {
  name: string;
  value: string;
  range: string;
  confidence: number;
}

export const MEASUREMENTS: Measurement[] = [
  { name: "Chest circumference", value: "96.4 cm", range: "±1.2 cm", confidence: 92 },
  { name: "Shoulder width", value: "45.8 cm", range: "±0.8 cm", confidence: 89 },
  { name: "Waist circumference", value: "82.0 cm", range: "±1.5 cm", confidence: 87 },
  { name: "Hip circumference", value: "97.2 cm", range: "±1.6 cm", confidence: 84 },
  { name: "Arm length", value: "63.5 cm", range: "±0.9 cm", confidence: 90 },
  { name: "Torso length", value: "48.1 cm", range: "±1.1 cm", confidence: 81 },
];

/* ---------- Marketplace ---------- */

export interface Listing {
  id: string;
  market: string;
  title: string;
  price: string;
  zone: FitZone;
  best?: boolean;
  score: number;
  verdict: string;
  body: string;
  chips: string[];
}

export const DEFAULT_QUERY = "margiela-style wool zip cardigan — size 3 or M";
export const DEFAULT_RESULT_TITLE = "WOOL ZIP CARDIGAN — ALL MARKETS";

export const LISTINGS: Listing[] = [
  {
    id: "grailed-1",
    market: "GRAILED",
    title: "Wool zip cardigan · size 3 · used, excellent",
    price: "$185",
    zone: "ideal",
    best: true,
    score: 94,
    verdict: "Size 3 fits like your favourite zip-up",
    body: "— 2 cm narrower through the shoulders, 3 cm longer in the body. Seller measurements verified against brand size chart.",
    chips: ["SELLER 4.9★", "PRICE 22% UNDER AVG", "WOOL 80 / NYLON 20"],
  },
  {
    id: "ssense-1",
    market: "SSENSE",
    title: "Same style · new, current season · size 3",
    price: "$540",
    zone: "fitted",
    score: 81,
    verdict: "Fitted — closer than you usually wear knits.",
    body: "Chest ease 14 cm vs. your preferred 16 cm. Free returns make this a safe try.",
    chips: ["NEW", "FREE RETURNS", "FULL SIZE CHART"],
  },
  {
    id: "ebay-1",
    market: "EBAY",
    title: "Similar cut, older season · size M",
    price: "$120",
    zone: "oversized",
    score: 62,
    verdict: "Likely oversized and long.",
    body: "No seller measurements — estimate from photos and brand history only. Body length ≈ +5 cm vs. your reference.",
    chips: ["NO MEASUREMENTS", "SELLER 4.6★", "AI-ESTIMATED"],
  },
  {
    id: "cettire-1",
    market: "CETTIRE",
    title: "Same style · new · size 2",
    price: "$405",
    zone: "tight",
    score: 48,
    verdict: "Size 2 will be tight across the shoulders.",
    body: "− 3 cm shoulder vs. your zip-up with low-stretch wool. High return risk; final-sale item.",
    chips: ["FINAL SALE", "LOW STRETCH", "SIZE 3 SOLD OUT"],
  },
];

/** Listings that pass the "FITS ME" filter: ideal, fitted or relaxed with decent confidence. */
export function fitsMe(listing: Listing): boolean {
  return listing.zone !== "tight" && listing.zone !== "oversized" && listing.score >= 70;
}

export const SCORE_EXPLAINER =
  "Purchase Confidence Score combines predicted fit, price vs. 90-day history, condition, seller reliability, and wardrobe compatibility. Predictions improve every time you file post-purchase fit feedback.";
