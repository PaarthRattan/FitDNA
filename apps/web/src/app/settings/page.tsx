import type { Metadata } from "next";
import Link from "next/link";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { getUser } from "@/lib/db/auth";
import { loadConsent } from "@/lib/db/passport";
import { supabaseEnv } from "@/lib/supabase/env";
import { signOut } from "../login/actions";
import { withdrawConsent } from "../passport/actions";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Settings" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const withdrawn = (await searchParams).consent === "withdrawn";
  const user = await getUser();
  const configured = supabaseEnv() !== null;
  const consent = user ? await loadConsent("/settings") : null;

  return (
    <>
      <TopBanner title="Settings" />
      <Eyebrow tint="salmon">Settings</Eyebrow>
      <main className="p-5 flex-1 flex flex-col gap-5">
        {withdrawn && (
          <p role="status" className="border border-ink bg-tint-lime px-3 py-2 font-ui font-bold text-xs max-w-xl">
            Consent withdrawn. Your body measurements have been deleted.
          </p>
        )}

        <Card className="max-w-xl">
          <CardTitleBar>
            <CardTitle>ACCOUNT</CardTitle>
          </CardTitleBar>
          <div className="p-4 font-body text-sm flex flex-col gap-3">
            {!configured ? (
              <p>Accounts aren&apos;t set up on this server yet.</p>
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

        {user && consent && (
          <>
            <Card className="max-w-xl">
              <CardTitleBar>
                <CardTitle>BODY DATA CONSENT</CardTitle>
              </CardTitleBar>
              <div className="p-4 font-body text-sm flex flex-col gap-3">
                {consent.granted ? (
                  <>
                    <p>
                      You&apos;ve agreed to us keeping your body measurements.{" "}
                      <Link href="/passport/consent">What that covers</Link>. Withdrawing deletes them straight away.
                    </p>
                    <form action={withdrawConsent}>
                      <Button type="submit" variant="secondary">
                        Withdraw and delete my measurements
                      </Button>
                    </form>
                  </>
                ) : (
                  <p>
                    We don&apos;t hold any body measurements for you. You&apos;ll be asked before any are saved.
                  </p>
                )}
              </div>
            </Card>

            <Card className="max-w-xl">
              <CardTitleBar>
                <CardTitle>DELETE MY DATA</CardTitle>
              </CardTitleBar>
              <div className="p-4 font-body text-sm flex flex-col gap-3">
                <p>
                  Permanently deletes your account and everything in it: measurements, reference garments, fit notes,
                  consent records, and the listings you imported, corrected, saved or bought. This can&apos;t be undone.
                </p>
                <DeleteAccountForm />
              </div>
            </Card>
          </>
        )}
      </main>
      <FooterNav />
    </>
  );
}
