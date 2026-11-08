import {
  CHEST_BASES,
  GARMENT_CATEGORIES,
  GARMENT_FIELDS,
  STRETCH_OPTIONS,
  TITLE_MAX_LENGTH,
} from "@/lib/passport/fields";
import { measurement, oneOf, text, unit, type FieldErrors, type Parsed } from "@/lib/passport/parse";
import type { ListingFormInput } from "./fit";

/** Size labels on listings run longer than on the user's own garments ("US M / EU 48"). */
export const LISTING_SIZE_MAX_LENGTH = 40;

export const LISTING_FORM_FIELDS = [
  "id",
  "title",
  "category",
  "sizeLabel",
  "stretch",
  "unit",
  "chest",
  "chestBasis",
  "shoulder",
  "length",
  "sleeve",
] as const;

/**
 * The listing confirm form. Category is required (it picks the reference garment to
 * compare against); every measurement is optional, since many listings give only a
 * few. A blank measurement means "ignore the listing's value for this".
 */
export function parseListingForm(fd: FormData): Parsed<ListingFormInput> {
  const errors: FieldErrors = {};
  const from = unit(fd);
  if (!from) errors.unit = "Choose centimetres or inches.";

  const title = text(fd, "title");
  if (title.length > TITLE_MAX_LENGTH) errors.title = `Keep the name under ${TITLE_MAX_LENGTH} characters.`;

  const category = oneOf(text(fd, "category"), GARMENT_CATEGORIES);
  if (!category) errors.category = "Choose what kind of garment it is: FitDNA compares it with one of yours of the same kind.";

  const sizeLabel = text(fd, "sizeLabel");
  if (sizeLabel.length > LISTING_SIZE_MAX_LENGTH) errors.sizeLabel = `Keep the size under ${LISTING_SIZE_MAX_LENGTH} characters.`;

  const stretch = oneOf(text(fd, "stretch") || "none", STRETCH_OPTIONS);
  if (!stretch) errors.stretch = "Choose how stretchy it is.";

  const chestBasis = oneOf(text(fd, "chestBasis") || "flat", CHEST_BASES);
  if (!chestBasis) errors.chestBasis = "Choose how the chest was measured.";

  let chestCm: number | null = null;
  let shoulderCm: number | null = null;
  let lengthCm: number | null = null;
  let sleeveCm: number | null = null;
  if (from) {
    const chestRange = GARMENT_FIELDS.chest[chestBasis ?? "flat"];
    chestCm = measurement(fd, "chest", from, GARMENT_FIELDS.chest.label, chestRange, errors);
    shoulderCm = measurement(fd, "shoulder", from, GARMENT_FIELDS.shoulder.label, GARMENT_FIELDS.shoulder, errors);
    lengthCm = measurement(fd, "length", from, GARMENT_FIELDS.length.label, GARMENT_FIELDS.length, errors);
    sleeveCm = measurement(fd, "sleeve", from, GARMENT_FIELDS.sleeve.label, GARMENT_FIELDS.sleeve, errors);
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title: title || null,
      category: category!,
      sizeLabel: sizeLabel || null,
      stretch: stretch!,
      chestCm,
      chestBasis: chestBasis!,
      shoulderCm,
      lengthCm,
      sleeveCm,
    },
  };
}
