"use client";

import { useActionState } from "react";
import { Button, INPUT, LABEL } from "@/components/ui";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <p className="font-body text-sm" role="status">
        Check your inbox. We sent a sign-in link to <b>{state.email}</b>. It works once and expires in an hour.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className={LABEL}>
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.status === "error" ? state.email : undefined}
        aria-describedby={state.status === "error" ? "login-error" : undefined}
        className={INPUT}
      />
      {state.status === "error" && (
        <p id="login-error" role="alert" className="font-body text-sm text-primary">
          {state.message}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Email me a link"}
        </Button>
      </div>
    </form>
  );
}
