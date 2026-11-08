"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CONFIRM_WORD } from "./constants";

export type DeleteState = { error: string } | null;

/**
 * Deletes the signed-in user's account. Every user-owned table cascades from the auth
 * user, so this removes their consents, measurements, reference garments, preferences,
 * listing imports, corrections, saves and purchases in one step. Shared listing rows
 * hold nothing about the user and stay. Needs the typed confirmation word; the user id
 * comes only from the session.
 */
export async function deleteMyData(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const user = await getUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login?next=/settings");

  if (String(formData.get("confirm") ?? "").trim() !== CONFIRM_WORD) {
    return { error: `Type ${CONFIRM_WORD} in capitals to confirm.` };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Account deletion isn't set up on this server yet. Nothing was deleted." };

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("deleteMyData failed", { status: error.status, code: error.code });
    return { error: "Couldn't delete your account. Nothing was deleted; please try again." };
  }

  // The account is gone; clear this browser's session cookies without calling the server.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?deleted=1");
}
