"use client";

import { useActionState } from "react";
import { FormError, TextField } from "@/components/form";
import { Button } from "@/components/ui";
import { deleteMyData, type DeleteState } from "./actions";
import { CONFIRM_WORD } from "./constants";

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(deleteMyData, null);
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormError message={state?.error} />
      <TextField id="confirm" label={`Type ${CONFIRM_WORD} to confirm`} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Deleting…" : "Delete my account and data"}
        </Button>
      </div>
    </form>
  );
}
