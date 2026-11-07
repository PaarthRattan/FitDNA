import type { FitZone } from "./fit-zones";

/* ------------------------------------------------------------------ */
/* Static mock data mirroring the FitDNA mockups. Replace with API data */
/* once the Fit Passport / fit-engine backend exists (see ROADMAP).     */
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

/* ---------- Passport ---------- */

export const PASSPORT = {
  completePct: 82,
  lastScan: "JUL 22 '26",
  rescanDue: true,
  nudge:
    "Add one more reference garment — an oversized piece — and prediction confidence rises across every marketplace.",
};

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

export interface FitPreference {
  category: string;
  text: string;
}

export const FIT_PREFERENCES: FitPreference[] = [
  { category: "TEES", text: "Fitted through chest and shoulders; hem at mid-fly. Reference: ideal fitted tee." },
  { category: "KNITS", text: "Relaxed body, sleeves never past first knuckle. Reference: favourite zip-up." },
  { category: "OUTERWEAR", text: "Boxy and oversized; room to layer a hoodie. Reference: baggy work jacket." },
];

export interface ReferenceSlot {
  name: string;
  role: string;
  photo: string;
  empty?: boolean;
}

export const REFERENCE_SLOTS: ReferenceSlot[] = [
  { name: "ZIP-UP", role: "Knit reference", photo: "photo" },
  { name: "FITTED TEE", role: "Top reference", photo: "photo" },
  { name: "WORK JACKET", role: "Outerwear reference", photo: "photo" },
  { name: "+ ADD", role: "Oversized ref. missing", photo: "empty slot", empty: true },
];

/* ---------- Wardrobe ---------- */

export interface Garment {
  id: string;
  title: string;
  sub: string;
  zone: FitZone;
  body: string;
  chips: string[];
  sticker?: string;
  photo: string;
}

export const GARMENTS: Garment[] = [
  {
    id: "zip-up",
    title: "FAVOURITE ZIP-UP",
    sub: "Reference · knitwear · size M",
    zone: "ideal",
    body: "Your gold standard for knit fit. Every sweater and cardigan prediction is compared against this piece.",
    chips: ["SHOULDER 47 CM", "CHEST 112 CM", "LENGTH 66 CM", "WOOL 80%"],
    sticker: "REFERENCE",
    photo: "garment photo — zip-up sweater",
  },
  {
    id: "fitted-tee",
    title: "IDEAL FITTED TEE",
    sub: "Reference · tops · size M",
    zone: "fitted",
    body: "Defines “fitted” for tees and light tops. Used for close-fit predictions across all marketplaces.",
    chips: ["SHOULDER 44 CM", "CHEST 100 CM", "LENGTH 70 CM", "COTTON 100%"],
    sticker: "REFERENCE",
    photo: "garment photo — fitted tee",
  },
  {
    id: "work-jacket",
    title: "BAGGY WORK JACKET",
    sub: "Reference · outerwear · size L",
    zone: "relaxed",
    body: "Defines your relaxed silhouette. Anchors predictions for chore coats, overshirts and boxy outerwear.",
    chips: ["SHOULDER 52 CM", "CHEST 124 CM", "LENGTH 72 CM", "LOW STRETCH"],
    sticker: "REFERENCE",
    photo: "garment photo — work jacket",
  },
];

export interface Prediction {
  item: string;
  size: string;
  zone: FitZone;
  note: string;
  confidence: number;
  outcome: string;
}

export const PREDICTIONS: Prediction[] = [
  { item: "Lemaire twisted tee — SSENSE", size: "M", zone: "ideal", note: "fits like your fitted tee", confidence: 91, outcome: "Awaiting fit check" },
  { item: "Wool zip cardigan — Grailed", size: "3", zone: "fitted", note: "2 cm narrower shoulders", confidence: 86, outcome: "Purchased · $185" },
  { item: "Nylon field jacket — eBay", size: "L", zone: "oversized", note: "+4 cm body length", confidence: 74, outcome: "Skipped" },
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
