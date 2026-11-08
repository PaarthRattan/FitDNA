"use client";

import { useActionState } from "react";
import { FormError, TextField } from "@/components/form";
import { Button } from "@/components/ui";
import { SUPPORTED_SITES } from "@/lib/listings/url";
import { startImport, type FormState } from "../actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(startImport, null);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state?.errors.form} />
      <TextField
        id="url"
        label="Link to the listing"
        required
        placeholder="https://www.grailed.com/listings/…"
        hint={`One listing at a time, from ${SUPPORTED_SITES}.`}
        defaultValue={state?.values.url}
        error={state?.errors.url}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Read this listing"}
        </Button>
      </div>
    </form>
  );
}
