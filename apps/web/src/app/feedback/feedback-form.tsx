"use client";

import { useActionState } from "react";
import { ChoiceGroup, FormError, SelectField } from "@/components/form";
import { Button } from "@/components/ui";
import { FIT_ZONES, FIT_ZONE_ORDER } from "@/lib/fit-zones";
import { PART_LABELS } from "@/lib/listings/labels";
import { saveFeedback, type FormState } from "./actions";

const ZONE_OPTIONS = FIT_ZONE_ORDER.map((z) => ({ value: z, label: FIT_ZONES[z].label.charAt(0) + FIT_ZONES[z].label.slice(1).toLowerCase(), swatch: FIT_ZONES[z].bg }));
const PART_OPTIONS = [{ value: "", label: "Not sure" }, ...ZONE_OPTIONS.map(({ value, label }) => ({ value, label }))];
const KEPT_OPTIONS = [
  { value: "yes", label: "Kept it" },
  { value: "no", label: "Sending it back or selling it on" },
  { value: "", label: "Not decided" },
];

/** How did it fit? Overall is required; each part is optional. */
export function FeedbackForm({ initial }: { initial: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveFeedback, null);
  const values = state?.values ?? initial;
  const errors = state?.errors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={values.id} />
      <FormError message={errors.form} />
      <ChoiceGroup name="overall" legend="How does it fit overall?" required options={ZONE_OPTIONS} defaultValue={values.overall} error={errors.overall} />
      <div className="border-t border-ink pt-4 grid sm:grid-cols-2 gap-4">
        {(["chest", "shoulder", "length", "sleeve"] as const).map((part) => (
          <SelectField key={part} id={part} label={PART_LABELS[part]} options={PART_OPTIONS} defaultValue={values[part] ?? ""} error={errors[part]} />
        ))}
      </div>
      <ChoiceGroup name="kept" legend="Did you keep it?" options={KEPT_OPTIONS} defaultValue={values.kept ?? ""} error={errors.kept} />
      <div className="flex gap-2 flex-wrap">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save fit check"}
        </Button>
        <Button href="/feedback" variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
