"use client";

import { useActionState } from "react";
import { FormError, TextField, UnitChoice } from "@/components/form";
import { Button } from "@/components/ui";
import { BODY_FIELDS } from "@/lib/passport/fields";
import { saveMeasurements, type FormState } from "../actions";

export function MeasurementsForm({ initial }: { initial: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveMeasurements, null);
  // After a failed save, refill the form exactly as it was typed.
  const values = state?.values ?? { unit: "cm", ...initial };
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={errors.form} />
      <UnitChoice defaultValue={values.unit} error={errors.unit} />
      {BODY_FIELDS.map((field) => (
        <TextField
          key={field.name}
          id={field.name}
          label={field.label}
          hint={field.how}
          error={errors[field.name]}
          defaultValue={values[field.name]}
          numeric
        />
      ))}
      <p className="font-body text-xs text-[#333]">Leave a field blank to remove that measurement.</p>
      <div className="flex gap-2 flex-wrap">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save measurements"}
        </Button>
        <Button href="/passport" variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
