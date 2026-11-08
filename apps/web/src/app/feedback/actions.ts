"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/auth";
import { FEEDBACK_FIELDS, parseFeedbackForm } from "@/lib/feedback/feedback";
import { echo, isUuid, type FieldErrors } from "@/lib/passport/parse";
import { createClient } from "@/lib/supabase/server";

/**
 * Fit-check mutations. The user id comes only from the session, and the purchase must
 * be the user's own (checked here and by row-level security).
 */

export type FormState = { errors: FieldErrors; values: Record<string, string> } | null;

export async function saveFeedback(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = echo(formData, FEEDBACK_FIELDS);
  const id = values.id;
  const user = await getUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect(`/login?next=${encodeURIComponent(isUuid(id) ? `/feedback/${id}` : "/feedback")}`);
  if (!isUuid(id)) return { errors: { form: "That purchase couldn't be found." }, values };

  const parsed = parseFeedbackForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const own = await supabase.from("purchases").select("id").eq("id", id).eq("user_id", user.id).limit(1);
  if (own.error || own.data.length === 0) return { errors: { form: "That purchase couldn't be found." }, values };

  const { overall, parts, kept } = parsed.value;
  const { error } = await supabase.from("fit_feedback").upsert(
    {
      user_id: user.id,
      purchase_id: id,
      overall,
      chest: parts.chest ?? null,
      shoulder: parts.shoulder ?? null,
      length: parts.length ?? null,
      sleeve: parts.sleeve ?? null,
      kept,
    },
    { onConflict: "purchase_id" },
  );
  if (error) {
    console.error("Fit check: couldn't save", error.message);
    return { errors: { form: "Couldn't save. Please try again." }, values };
  }
  redirect("/feedback?saved=1");
}
