import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { getUser } from "@/lib/db/auth";
import { supabaseEnv } from "@/lib/supabase/env";
import { signOut } from "../login/actions";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  const user = await getUser();
  const configured = supabaseEnv() !== null;

  return (
    <>
      <TopBanner title="Settings" />
      <Eyebrow tint="salmon">Settings</Eyebrow>
      <main className="p-5 flex-1 flex flex-col gap-5">
        <Card className="max-w-xl">
          <CardTitleBar>
            <CardTitle>ACCOUNT</CardTitle>
          </CardTitleBar>
          <div className="p-4 font-body text-sm flex flex-col gap-3">
            {!configured ? (
              <p>Accounts aren&apos;t set up on this server yet, so the app is showing demo data.</p>
            ) : user ? (
              <>
                <p>
                  Signed in as <b>{user.email}</b>.
                </p>
                <form action={signOut}>
                  <Button type="submit" variant="secondary">
                    Sign out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <p>You&apos;re not signed in.</p>
                <div>
                  <Button href="/login?next=/settings">Sign in</Button>
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="border border-ink p-5 font-body text-sm max-w-xl">
          Manage consent, scan retention, and your data. Raw scan photos are deleted immediately after processing; you can delete everything else at any time.
          <div className="mt-3">
            <Button href="/">Back to wardrobe</Button>
          </div>
        </div>
      </main>
      <FooterNav />
    </>
  );
}
