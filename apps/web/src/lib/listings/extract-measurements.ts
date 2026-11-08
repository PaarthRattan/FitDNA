import type { Condition } from "@/lib/fit/score";
import type { ChestBasis, FitPart, GarmentCategory } from "@/lib/fit/types";
import { GARMENT_FIELDS } from "@/lib/passport/fields";
import { MAX_PAGE_CHARS } from "./constants";

/**
 * Deterministic first pass over a listing's text: the seller's measurements, size
 * label, condition and garment category. No model is involved. When the text is
 * ambiguous, a value is left out rather than guessed; the user confirms everything
 * in the form before it's used. Every measurement keeps the text it was read from
 * and what had to be assumed to read it.
 */

/** Bump whenever a pattern or rule here changes, so listings are re-read on their next fetch. */
export const EXTRACTOR_VERSION = "regex-2";

export type Unit = "cm" | "in";

/** What had to be assumed: the unit, flat vs all the way around, or a range's midpoint. */
export type Assumption = "unit" | "basis" | "range";

export interface ExtractedMeasurement {
  cm: number;
  /** Chest only. */
  basis?: ChestBasis;
  unit: Unit;
  /** The text this was read from, as written on the page. */
  span: string;
  assumed: Assumption[];
}

export type ListingCategory = GarmentCategory | "out_of_scope";

export interface ListingExtraction {
  measurements: Partial<Record<FitPart, ExtractedMeasurement>>;
  /** Parts given more than once with different values, so left out. */
  conflicting: FitPart[];
  category: ListingCategory | null;
  sizeLabel: string | null;
  condition: Condition | null;
}

const CM_PER_INCH = 2.54;
const SPAN_MAX = 80;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Text clean-up
// ---------------------------------------------------------------------------

function normalise(text: string): string {
  return text
    .slice(0, MAX_PAGE_CHARS)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // markdown images
    // Links, text and all: "similar items" cards, breadcrumbs and help links are
    // never the seller's description, and their targets can contain numbers.
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[   \t]/g, " ")
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/[‐-―−]/g, "-")
    .replace(/\\(["'*_|-])/g, "$1") // markdown escapes, e.g. 22\"
    .replace(/\*\*|__|`/g, "")
    .replace(/\|/g, " : ") // table cells read as "label : value"
    .replace(/(\d)\s?''/g, '$1"');
}

// ---------------------------------------------------------------------------
// Measurement patterns
// ---------------------------------------------------------------------------

const NUM = String.raw`(?<num>\d{1,3}(?:[.,]\d{1,2})?)(?!\d)(?:\s+(?<frac>1\/2|1\/4|3\/4)|\s*(?<glyph>[½¼¾]))?`;
const RANGE = String.raw`(?:\s*(?:-|to)\s*(?<range>\d{1,3}(?:[.,]\d{1,2})?)(?!\d))?`;
const UNIT = String.raw`\s*(?<unit>cm|centimet(?:er|re)s?|inch(?:es)?|in(?![a-z])\.?|")`;
const HEADER = String.raw`(?:\s*\(\s*(?<header>cm|inches|inch|in|flat|laid\s*flat|across)\s*\))?`;
const SEP = String.raw`[\s:=~-]{0,6}(?:(?:is|of|measures?|approx(?:imately)?\.?|about|around|roughly|ca\.?)[\s:=~-]{1,4})?`;

/** Labels per part, most specific first; earlier entries win when two readings overlap. */
const LABELS: ReadonlyArray<{ part: FitPart; basis?: ChestBasis; label: string }> = [
  {
    part: "chest",
    basis: "flat",
    label: String.raw`(?:arm\s*)?pit\s*(?:to|2|-)\s*(?:arm\s*)?pit|p2p|ptp|underarm\s*(?:to|-)\s*underarm|chest\s*\(\s*(?:flat|laid\s*flat|across)\s*\)|chest\s*(?:width|flat|laid\s*flat)|(?:across|width\s*(?:across|of))\s*(?:the\s*)?chest`,
  },
  {
    part: "chest",
    basis: "circumference",
    label: String.raw`chest\s*(?:circumference|circ\.?|all\s*(?:the\s*way\s*)?around|around)|(?:full|total)\s*chest`,
  },
  {
    part: "length",
    label: String.raw`(?:shoulder|collar|neck|hps|top)\s*(?:seam\s*)?(?:to|-)\s*(?:the\s*)?(?:hem|bottom)|(?:back|body|total|overall|full|garment|front)\s*length|(?<!sleeves?\s{0,3})length`,
  },
  {
    part: "sleeve",
    // Not "centre back to cuff" or "underarm to cuff": those are different measurements.
    label: String.raw`shoulder\s*(?:seam\s*)?(?:to|-)\s*(?:the\s*)?(?:cuff|wrist|sleeve\s*end)|sleeves?(?:\s*length)?(?!\s*\(?\s*(?:from\s*)?(?:cent(?:er|re)|cb\b|under|arm|pit))`,
  },
  {
    part: "shoulder",
    label: String.raw`shoulder\s*(?:seam\s*)?(?:to|-)\s*shoulder(?:\s*seam)?|(?:across|width\s*of)\s*(?:the\s*)?shoulders?|shoulders?(?:\s*width)?`,
  },
  { part: "chest", label: String.raw`chest|bust` },
];

interface Pattern {
  part: FitPart;
  basis?: ChestBasis;
  priority: number;
  /** "22 in pit to pit" rather than "pit to pit: 22 in". */
  valueFirst: boolean;
  re: RegExp;
}

/** Labels can end in ")", so "no letter follows" stands in for a closing \b. */
const END = "(?![a-z])";

/** "Chest: 22 in", and "22 in pit to pit" (the second needs an explicit unit). */
const PATTERNS: Pattern[] = LABELS.flatMap(({ part, basis, label }, priority) => [
  {
    part,
    basis,
    priority,
    valueFirst: false,
    re: new RegExp(String.raw`\b(?:${label})${END}${HEADER}${SEP}${NUM}${RANGE}(?:${UNIT})?`, "gi"),
  },
  {
    part,
    basis,
    priority: priority + LABELS.length,
    valueFirst: true,
    // Same line only: "68.6 cm⏎Shoulders" is the end of one item and the start of the next.
    re: new RegExp(String.raw`(?<![\d.,])${NUM}${UNIT}[ \t:=~-]{0,3}(?:of[ \t]+|across[ \t]+(?:the[ \t]+)?)?\b(?:${label})${END}`, "gi"),
  },
]);

/** Plausible garment values (cm) to accept a reading at all. */
const VALID: Record<FitPart, { min: number; max: number }> = {
  chest: { min: GARMENT_FIELDS.chest.flat.min, max: GARMENT_FIELDS.chest.circumference.max },
  shoulder: GARMENT_FIELDS.shoulder,
  length: GARMENT_FIELDS.length,
  sleeve: GARMENT_FIELDS.sleeve,
};

/** Typical values (cm), used only to tell a unitless "22" (inches) from "56" (cm). */
const TYPICAL: Record<FitPart, { min: number; max: number }> = {
  chest: { min: 40, max: 140 },
  shoulder: { min: 35, max: 65 },
  length: { min: 50, max: 100 },
  sleeve: { min: 15, max: 80 },
};

/** A flat chest above this, or a circumference below the next, isn't plausible for an adult top. */
const FLAT_CHEST_MAX = 75;
const ROUND_CHEST_MIN = 80;

const DOC_UNIT = /\bmeasure(?:ments?|d)?\b[^.\n]{0,25}?(?:\bin\b|\()\s*(inches|inch|in\b|cm|centimet(?:er|re)s?)/i;
/** "Fits chest 40", "model's chest": about a person, not the garment. Stops at a sentence or clause break. */
const ABOUT_A_PERSON = /\b(?:fits?|to\s+fit|model'?s?|wearer|worn\s+by)\b[^.,;\n]*$/i;
/** A "range" whose ends differ more than this is two different numbers, not a range. */
const MAX_RANGE_SPREAD = 0.15;
/** The same value again in the other unit: "22\" (56 cm)", "28\"/71cm", or on the next line. */
const NEXT_VALUE = /^\s*[/(]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(cm|centimet(?:er|re)s?|inch(?:es)?|in(?![a-z])|")/i;
/** "Measured with garment laid flat": a plain "Chest" on this page is flat. */
const DOC_FLAT = /\b(?:laid|lying|laying|measured|measurements?\s+taken)\s+(?:\w+\s+){0,3}flat\b|\bflat[\s-]+lay\b/i;
/** Another number straight after the value: a size-chart row such as "Chest 50 52 54". */
const TABLE_ROW = /^\s*(?:[:,/]\s*)?\d/;

/** True when `after` starts with this reading's value in the other unit, e.g. "20.5 in" then "52.1 cm". */
function isSameInOtherUnit(g: Record<string, string | undefined>, after: string): boolean {
  const unit = toUnit(g.unit);
  const next = after.match(NEXT_VALUE);
  const nextUnit = toUnit(next?.[2]);
  if (!unit || !next || !nextUnit || nextUnit === unit || g.range) return false;
  const toCmValue = (v: number, u: Unit) => (u === "in" ? v * CM_PER_INCH : v);
  const a = toCmValue(parseNumber(g.num!, g.frac, g.glyph), unit);
  const b = toCmValue(parseNumber(next[1]), nextUnit);
  return Math.abs(a - b) <= Math.max(0.6, 0.02 * a);
}

function toUnit(raw: string | undefined): Unit | null {
  if (!raw) return null;
  const u = raw.toLowerCase();
  if (u.startsWith("c")) return "cm";
  if (u.startsWith("in") || u === '"') return "in";
  return null;
}

function parseNumber(num: string, frac?: string, glyph?: string): number {
  const fraction: Record<string, number> = { "1/2": 0.5, "1/4": 0.25, "3/4": 0.75, "½": 0.5, "¼": 0.25, "¾": 0.75 };
  return Number(num.replace(",", ".")) + (fraction[frac ?? glyph ?? ""] ?? 0);
}

interface Reading {
  part: FitPart;
  basis?: ChestBasis;
  priority: number;
  start: number;
  end: number;
  value: number;
  unit: Unit | null;
  basisHint: ChestBasis | null;
  span: string;
  assumed: Assumption[];
}

function lineBefore(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return text.slice(Math.max(lineStart, index - 60), index);
}

function findReadings(text: string): Reading[] {
  const found: Reading[] = [];
  for (const pattern of PATTERNS) {
    for (const m of text.matchAll(pattern.re)) {
      const g = m.groups!;
      const start = m.index!;
      const end = start + m[0].length;
      const after = text.slice(end, end + 24);
      if (ABOUT_A_PERSON.test(lineBefore(text, start))) continue;
      if (!pattern.valueFirst && !isSameInOtherUnit(g, after) && (TABLE_ROW.test(after) || /^\s*%/.test(after))) continue;

      const assumed: Assumption[] = [];
      let value = parseNumber(g.num, g.frac, g.glyph);
      if (g.range) {
        const other = parseNumber(g.range);
        if (Math.abs(other - value) > MAX_RANGE_SPREAD * Math.max(other, value)) continue;
        value = (value + other) / 2;
        assumed.push("range");
      }
      const header = g.header?.toLowerCase().replace(/\s+/g, " ");
      const headerBasis = header && /flat|across/.test(header) ? "flat" : null;
      let basisHint: ChestBasis | null = headerBasis;
      if (/^\s*\(?\s*(?:flat|laid\s*flat|across)\b|^\s*x\s*2\b/i.test(after)) basisHint = "flat";
      else if (/^\s*\(?\s*(?:around|circumference|all\s*(?:the\s*way\s*)?around)\b/i.test(after)) basisHint = "circumference";

      found.push({
        part: pattern.part,
        basis: pattern.basis,
        priority: pattern.priority,
        start,
        end,
        value,
        unit: toUnit(g.unit) ?? (headerBasis ? null : toUnit(header)),
        basisHint,
        span: m[0].trim().replace(/\s+/g, " ").slice(0, SPAN_MAX),
        assumed,
      });
    }
  }

  // Overlapping readings of the same text: the one starting first wins, then the more specific label.
  found.sort((a, b) => a.start - b.start || a.priority - b.priority || b.end - a.end);
  const kept: Reading[] = [];
  for (const r of found) {
    if (!kept.some((k) => r.start < k.end && k.start < r.end)) kept.push(r);
  }
  return kept;
}

function plausibleUnits(part: FitPart, value: number): Unit[] {
  const { min, max } = TYPICAL[part];
  return (["cm", "in"] as const).filter((u) => {
    const cm = u === "in" ? value * CM_PER_INCH : value;
    return cm >= min && cm <= max;
  });
}

/** Fills in missing units: the page's stated unit, else whichever unit makes the number plausible. */
function resolveUnits(readings: Reading[], docUnit: Unit | null): void {
  const undecided: Reading[] = [];
  for (const r of readings) {
    if (r.unit) continue;
    if (docUnit) {
      r.unit = docUnit;
      continue;
    }
    const units = plausibleUnits(r.part, r.value);
    if (units.length === 1) {
      r.unit = units[0];
      r.assumed.push("unit");
    } else if (units.length === 2) {
      undecided.push(r);
    }
  }
  // Still ambiguous (e.g. a sleeve of "25"): go with the unit the rest of the page uses.
  const counts = { cm: 0, in: 0 };
  for (const r of readings) if (r.unit) counts[r.unit] += 1;
  const majority: Unit | null = counts.cm > counts.in ? "cm" : counts.in > counts.cm ? "in" : null;
  for (const r of undecided) {
    if (!majority) continue;
    r.unit = majority;
    r.assumed.push("unit");
  }
}

function toMeasurement(r: Reading, docFlat: boolean): ExtractedMeasurement | null {
  if (!r.unit) return null;
  const cm = round1(r.unit === "in" ? r.value * CM_PER_INCH : r.value);
  const m: ExtractedMeasurement = { cm, unit: r.unit, span: r.span, assumed: [...r.assumed] };
  if (r.part === "chest") {
    let basis = r.basis ?? r.basisHint ?? (docFlat && cm <= FLAT_CHEST_MAX ? "flat" : null);
    if (!basis) {
      if (cm <= FLAT_CHEST_MAX) basis = "flat";
      else if (cm >= ROUND_CHEST_MIN) basis = "circumference";
      else return null;
      m.assumed.push("basis");
    }
    m.basis = basis;
    const range = GARMENT_FIELDS.chest[basis];
    if (cm < range.min || cm > range.max) return null;
    return m;
  }
  const { min, max } = VALID[r.part];
  return cm >= min && cm <= max ? m : null;
}

/** Chest as a circumference, so a flat and a round reading of the same garment compare equal. */
const comparable = (m: ExtractedMeasurement) => (m.basis === "flat" ? m.cm * 2 : m.cm);

export function extractMeasurements(markdown: string): Pick<ListingExtraction, "measurements" | "conflicting"> {
  const text = normalise(markdown);
  const docUnit = toUnit(text.match(DOC_UNIT)?.[1]);
  const docFlat = DOC_FLAT.test(text);
  const readings = findReadings(text);
  resolveUnits(readings, docUnit);

  const byPart = new Map<FitPart, ExtractedMeasurement[]>();
  for (const r of readings) {
    const m = toMeasurement(r, docFlat);
    if (m) byPart.set(r.part, [...(byPart.get(r.part) ?? []), m]);
  }

  const measurements: ListingExtraction["measurements"] = {};
  const conflicting: FitPart[] = [];
  for (const [part, values] of byPart) {
    const first = values[0];
    const tolerance = part === "chest" ? 2 : 1;
    if (values.some((v) => Math.abs(comparable(v) - comparable(first)) > tolerance)) conflicting.push(part);
    // They agree: keep the reading that needed the fewest assumptions.
    else measurements[part] = values.reduce((best, v) => (v.assumed.length < best.assumed.length ? v : best));
  }
  return { measurements, conflicting };
}

// ---------------------------------------------------------------------------
// Size, condition, category
// ---------------------------------------------------------------------------

const SIZE_WORDS: Record<string, string> = {
  small: "S",
  medium: "M",
  large: "L",
  "x-large": "XL",
  xlarge: "XL",
  "extra large": "XL",
  "extra-large": "XL",
};

const LETTER = String.raw`(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl)(?![a-z])`;
const REGION = String.raw`(?:(?:us|uk|eu|it|jp)\s+)?`;
const SIZE_PATTERNS = [
  new RegExp(
    String.raw`\b(?:tagged\s+)?size\s*(?:tag(?:ged)?\s*)?(?:[:=-]|\bis\b)?\s*${REGION}(${LETTER}|small|medium|large|x-?large|extra[\s-]large|\d{1,2}(?:\.5)?(?![\d.,]|\s*(?:cm|in\b|"|%)))`,
    "i",
  ),
  new RegExp(String.raw`\btagged\s+(${LETTER})`, "i"),
  // Grailed's header: "Men's US M / EU 48-50 / 2".
  new RegExp(String.raw`\b(?:men|women)'?s\s+${REGION}(${LETTER})`, "i"),
];

/** The size label: from the first text that has one, at its earliest mention. */
export function extractSize(...texts: string[]): string | null {
  for (const t of texts) {
    const text = normalise(t);
    const matches = SIZE_PATTERNS.map((re) => text.match(re)).filter((m): m is RegExpMatchArray => m !== null);
    if (matches.length === 0) continue;
    const first = matches.reduce((a, b) => (b.index! < a.index! ? b : a));
    const raw = first[1].toLowerCase().replace(/\s+/g, " ");
    return SIZE_WORDS[raw] ?? raw.toUpperCase();
  }
  return null;
}

/** Best match first. Plain "used" is the weakest signal, so it's last. */
const CONDITION_WORDS: ReadonlyArray<[RegExp, Condition]> = [
  [/\bnew\s+with\s+tags\b|\bnwt\b|\bbrand\s+new\b|\bdeadstock\b/i, "new"],
  [/\bnew\s+without\s+tags\b|\bnwot\b|\blike\s+new\b|\bmint\b/i, "like_new"],
  [/\bexcellent\b|\bvery\s+good\b|\bgreat\b/i, "excellent"],
  [/\bgood\b|\bgently\s+used\b/i, "good"],
  [/\bfair\b|\bworn\b/i, "fair"],
  [/\bpoor\b|\bdamaged\b|\bflawed\b|\bfor\s+parts\b/i, "poor"],
  [/\bnew\b/i, "new"],
  [/\bused\b|\bpre-?owned\b/i, "good"],
];

/** Phrases specific enough to trust without a "Condition:" label. */
const CONDITION_PHRASES: ReadonlyArray<[RegExp, Condition]> = [
  [/\bnew\s+with\s+tags\b|\bbrand\s+new\b/i, "new"],
  [/\bnew\s+without\s+tags\b|\blike\s+new\b/i, "like_new"],
  [/\bgently\s+used\b/i, "good"],
];

const CONDITION_BEFORE_WORD: Record<string, Condition> = {
  excellent: "excellent",
  great: "excellent",
  "very good": "excellent",
  good: "good",
  fair: "fair",
  poor: "poor",
};

/**
 * Condition from, in order: a "Condition:" label (or "Condition" on its own line),
 * NWT / NWOT, a distinctive phrase such as "gently used", or "<word> condition".
 */
export function extractCondition(...texts: string[]): Condition | null {
  const all = texts.map(normalise);
  for (const text of all) {
    const labelled = text.match(/\bcondition\b(?:\s*[:=-]|\s+is\b|[ \t]*\n)\s*([^\n]{1,40})/i)?.[1];
    if (!labelled) continue;
    for (const [re, condition] of CONDITION_WORDS) if (re.test(labelled)) return condition;
  }
  for (const text of all) {
    if (/\bNWT\b/.test(text)) return "new";
    if (/\bNWOT\b/.test(text)) return "like_new";
  }
  for (const text of all) {
    for (const [re, condition] of CONDITION_PHRASES) if (re.test(text)) return condition;
    const before = text.match(/\b(excellent|great|very\s+good|good|fair|poor)\s+(?:used\s+)?condition\b/i)?.[1];
    if (before) return CONDITION_BEFORE_WORD[before.toLowerCase().replace(/\s+/g, " ")];
  }
  return null;
}

/** Checked in order: "shirt jacket" is a jacket, "sweatshirt" a knit, "t-shirt" a tee. */
const CATEGORY_WORDS: ReadonlyArray<[RegExp, GarmentCategory]> = [
  [/\b(?:jacket|coat|blazer|parka|bomber|anorak|windbreaker|puffer|overcoat|trench|peacoat|shacket|gilet|trucker)s?\b/i, "jacket"],
  [/\b(?:sweatshirt|hoodie|hoody|sweater|jumper|cardigan|knit|knitwear|pullover|crewneck|turtleneck|quarter[\s-]zip|fleece)s?\b/i, "knit"],
  [/\b(?:t[\s-]?shirt|tee|tank\s*top|tank)s?\b/i, "tee"],
  [/\b(?:shirt|overshirt|button[\s-](?:up|down)|flannel|oxford|polo|blouse)s?\b/i, "shirt"],
];

const OUT_OF_SCOPE = /\b(?:jeans|pants|trousers|chinos|shorts|skirt|dress|leggings|joggers|sweatpants|shoes|sneakers|trainers|boots|sandals|loafers|heels|hat|cap|beanie|bag|backpack|belt|socks|scarf|gloves|sunglasses|watch|necklace|ring|bracelet|earrings)\b/i;

/** The garment category, from the listing title. */
export function guessCategory(title: string | null): ListingCategory | null {
  if (!title) return null;
  for (const [re, category] of CATEGORY_WORDS) if (re.test(title)) return category;
  return OUT_OF_SCOPE.test(title) ? "out_of_scope" : null;
}

/**
 * Everything the regex pass can read from a listing. `description` is the page's
 * description meta tag: some sites (Depop) put the seller's text only there. It only
 * fills in parts the page itself doesn't give, so a truncated copy can't override
 * or conflict with the full text.
 */
export function extractListing({
  title,
  markdown,
  description = null,
}: {
  title: string | null;
  markdown: string;
  description?: string | null;
}): ListingExtraction {
  const fromPage = extractMeasurements(markdown);
  const measurements = { ...fromPage.measurements };
  if (description) {
    const fromDescription = extractMeasurements(description).measurements;
    for (const [part, m] of Object.entries(fromDescription) as Array<[FitPart, ExtractedMeasurement]>) {
      if (!measurements[part] && !fromPage.conflicting.includes(part)) measurements[part] = m;
    }
  }
  return {
    measurements,
    conflicting: fromPage.conflicting,
    category: guessCategory(title),
    sizeLabel: extractSize(title ?? "", markdown, description ?? ""),
    condition: extractCondition(markdown, description ?? ""),
  };
}

/** 0–1: lower when values had to be assumed. Zero when nothing was read. */
export function extractionConfidence(extraction: ListingExtraction): number {
  const values = Object.values(extraction.measurements);
  if (values.length === 0) return 0;
  const assumptions = values.reduce((n, m) => n + m.assumed.length, 0);
  return Math.max(0.5, Math.round((1 - 0.1 * assumptions) * 100) / 100);
}
