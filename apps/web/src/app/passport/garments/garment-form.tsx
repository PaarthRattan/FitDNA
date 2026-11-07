"use client";

import { useActionState } from "react";
import { ChoiceGroup, FormError, SelectField, TextField, UnitChoice } from "@/components/form";
import { Button } from "@/components/ui";
import { FIT_ZONES } from "@/lib/fit-zones";
import {
  CHEST_BASES,
  FIT_ZONE_CHOICES,
  GARMENT_CATEGORIES,
  GARMENT_FIELDS,
  SIZE_MAX_LENGTH,
  STRETCH_OPTIONS,
  TITLE_MAX_LENGTH,
} from "@/lib/passport/fields";
import { saveReference, type FormState } from "../actions";

const ZONE_OPTIONS = FIT_ZONE_CHOICES.map((z) => ({ ...z, swatch: FIT_ZONES[z.value].bg }));

/** Add or edit a reference garment. `initial.id` is set when editing. */
export function GarmentForm({ initial }: { initial: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveReference, null);
  const values = state?.values ?? initial;
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormError message={errors.form} />

      <TextField
        id="title"
        label="Name"
        required
        maxLength={TITLE_MAX_LENGTH}
        placeholder="e.g. grey zip-up"
        defaultValue={values.title}
        error={errors.title}
      />
      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField
          id="category"
          label="Kind of garment"
          required
          options={GARMENT_CATEGORIES}
          placeholder="Choose one"
          defaultValue={values.category}
          error={errors.category}
        />
        <TextField
          id="sizeLabel"
          label="Size on the label"
          maxLength={SIZE_MAX_LENGTH}
          placeholder="e.g. M or 48"
          defaultValue={values.sizeLabel}
          error={errors.sizeLabel}
        />
      </div>

      <ChoiceGroup
        name="fitZone"
        legend="How does it fit you?"
        required
        options={ZONE_OPTIONS}
        defaultValue={values.fitZone}
        error={errors.fitZone}
      />

      <div className="border-t border-ink pt-4 flex flex-col gap-4">
        <p className="font-body text-sm">
          Lay it flat on a table, smooth it out, and measure with a tape or ruler. Chest is required; the rest make
          predictions sharper.
        </p>
        <UnitChoice defaultValue={values.unit || "cm"} error={errors.unit} />
        <TextField
          id="chest"
          label={GARMENT_FIELDS.chest.label}
          required
          numeric
          hint={GARMENT_FIELDS.chest.how}
          defaultValue={values.chest}
          error={errors.chest}
        />
        <ChoiceGroup
          name="chestBasis"
          legend="How you measured the chest"
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
            hint={GARMENT_FIELDS[part].how}
            defaultValue={values[part]}
            error={errors[part]}
          />
        ))}
        <SelectField
          id="stretch"
          label="Stretch"
          options={STRETCH_OPTIONS}
          defaultValue={values.stretch || "none"}
          error={errors.stretch}
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Add garment"}
        </Button>
        <Button href="/passport" variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
