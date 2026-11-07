"use client";

import { useActionState } from "react";
import { FormError, TextAreaField } from "@/components/form";
import { Button } from "@/components/ui";
import { GARMENT_CATEGORIES, PREFERENCE_MAX_LENGTH } from "@/lib/passport/fields";
import { savePreferences, type FormState } from "../actions";

const EXAMPLES: Record<string, string> = {
  tee: "e.g. fitted through the chest, hem at mid-fly",
  shirt: "e.g. room to move in the shoulders, sleeves to the wrist bone",
  knit: "e.g. relaxed body, sleeves never past the first knuckle",
  jacket: "e.g. boxy, with room for a hoodie underneath",
};

export function PreferencesForm({ initial }: { initial: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(savePreferences, null);
  const values = state?.values ?? initial;
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={errors.form} />
      {GARMENT_CATEGORIES.map((c) => (
        <TextAreaField
          key={c.value}
          id={c.value}
          label={c.label}
          placeholder={EXAMPLES[c.value]}
          maxLength={PREFERENCE_MAX_LENGTH}
          defaultValue={values[c.value]}
          error={errors[c.value]}
        />
      ))}
      <div className="flex gap-2 flex-wrap">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
        <Button href="/passport" variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
