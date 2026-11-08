"use client";

import { useActionState } from "react";
import { ChoiceGroup, FormError, SelectField, TextField, UnitChoice } from "@/components/form";
import { Button } from "@/components/ui";
import { LISTING_SIZE_MAX_LENGTH } from "@/lib/listings/parse";
import { CHEST_BASES, GARMENT_CATEGORIES, GARMENT_FIELDS, STRETCH_OPTIONS, TITLE_MAX_LENGTH } from "@/lib/passport/fields";
import { saveListingFit, type FormState } from "../../actions";

type Part = "chest" | "shoulder" | "length" | "sleeve";

/** What to look for in the listing: the user is reading the seller's numbers, not measuring. */
const READING_HINTS: Record<Part, string> = {
  chest: "Usually given pit to pit, laid flat. If the seller gives the full chest, choose “all the way around” below.",
  shoulder: "Seam to seam across the back.",
  length: "Down the back, from the collar to the hem.",
  sleeve: "From the shoulder seam to the cuff. Not an underarm or centre-back sleeve, which are different measurements.",
};

/**
 * Confirm or correct a listing's numbers. `hints` says where each prefilled value
 * came from, so the user can check it against the listing.
 */
export function ListingForm({
  initial,
  hints,
  titlePlaceholder,
}: {
  initial: Record<string, string>;
  hints: Partial<Record<Part, string>>;
  titlePlaceholder: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveListingFit, null);
  const values = state?.values ?? initial;
  const errors = state?.errors ?? {};
  const hint = (part: Part) => [hints[part], READING_HINTS[part]].filter(Boolean).join(" ");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={values.id} />
      <FormError message={errors.form} />

      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField
          id="category"
          label="Kind of garment"
          required
          options={GARMENT_CATEGORIES}
          placeholder="Choose one"
          defaultValue={values.category}
          hint="It's compared with one of your own garments of the same kind."
          error={errors.category}
        />
        <TextField
          id="sizeLabel"
          label="Size on the label"
          maxLength={LISTING_SIZE_MAX_LENGTH}
          placeholder="e.g. M or 48"
          defaultValue={values.sizeLabel}
          error={errors.sizeLabel}
        />
      </div>
      <TextField
        id="title"
        label="Your name for it (optional)"
        maxLength={TITLE_MAX_LENGTH}
        placeholder={titlePlaceholder}
        defaultValue={values.title}
        error={errors.title}
      />

      <div className="border-t border-ink pt-4 flex flex-col gap-4">
        <p className="font-body text-sm">
          Measurements as the seller gives them, laid flat. Leave a box empty if the listing doesn&apos;t say, or if the
          number we read is wrong and you can&apos;t find the right one.
        </p>
        <UnitChoice defaultValue={values.unit || "cm"} error={errors.unit} />
        <TextField id="chest" label={GARMENT_FIELDS.chest.label} numeric hint={hint("chest")} defaultValue={values.chest} error={errors.chest} />
        <ChoiceGroup
          name="chestBasis"
          legend="How the chest was measured"
          options={CHEST_BASES}
          defaultValue={values.chestBasis || "flat"}
          error={errors.chestBasis}
        />
        {(["shoulder", "length", "sleeve"] as const).map((part) => (
          <TextField
            key={part}
            id={part}
            label={GARMENT_FIELDS[part].label}
            numeric
            hint={hint(part)}
            defaultValue={values[part]}
            error={errors[part]}
          />
        ))}
        <SelectField id="stretch" label="Stretch" options={STRETCH_OPTIONS} defaultValue={values.stretch || "none"} error={errors.stretch} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "See how it fits"}
        </Button>
        <Button href={`/search/${values.id}`} variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
