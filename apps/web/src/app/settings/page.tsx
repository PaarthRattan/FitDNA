import type { Metadata } from "next";
import Link from "next/link";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { getUser } from "@/lib/db/auth";
import { loadConsent } from "@/lib/db/passport";
import { supabaseEnv } from "@/lib/supabase/env";
import { signOut } from "../login/actions";
import { withdrawConsent, withdrawScanConsent } from "../passport/actions";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Settings" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const withdrawn = (await searchParams).consent;
  const user = await getUser();
  const configured = supabaseEnv() !== null;
  const [consent, scanConsent] = user
    ? await Promise.all([loadConsent("/settings"), loadConsent("/settings", "scan")])
    : [null, null];

  return (
    <>
      <TopBanner title="Settings" />
      <Eyebrow tint="salmon">Settings</Eyebrow>
      <main className="p-5 flex-1 flex flex-col gap-5">
        {withdrawn === "withdrawn" && (
          <p role="status" className="border border-ink bg-tint-lime px-3 py-2 font-ui font-bold text-xs max-w-xl">
            Consent withdrawn. Your body measurements, scans and avatar have been deleted.
          </p>
        )}
        {withdrawn === "scan-withdrawn" && (
          <p role="status" className="border border-ink bg-tint-lime px-3 py-2 font-ui font-bold text-xs max-w-xl">
            Photo-scan consent withdrawn. Your scans, your avatar and the measurements taken from scans have been deleted.
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
                      <Link href="/passport/consent">What that covers</Link>. Withdrawing deletes them straight away, along
                      with your scans and avatar.
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

            {scanConsent?.granted && (
              <Card className="max-w-xl">
                <CardTitleBar>
                  <CardTitle>PHOTO SCAN CONSENT</CardTitle>
                </CardTitleBar>
                <div className="p-4 font-body text-sm flex flex-col gap-3">
                  <p>
                    You&apos;ve agreed to photo scans. <Link href="/passport/scan/consent">What that covers</Link>. Withdrawing
                    deletes your scans, your avatar and any measurements taken from scans; tape measurements stay.
                  </p>
                  <form action={withdrawScanConsent}>
                    <Button type="submit" variant="secondary">
                      Withdraw and delete my scans
                    </Button>
                  </form>
                </div>
              </Card>
            )}

            <Card className="max-w-xl">
              <CardTitleBar>
                <CardTitle>DELETE MY DATA</CardTitle>
              </CardTitleBar>
              <div className="p-4 font-body text-sm flex flex-col gap-3">
                <p>
                  Permanently deletes your account and everything in it: measurements, scans and your avatar, reference
                  garments, fit notes, consent records, the listings you imported, corrected, saved or bought, and your fit
                  checks. This can&apos;t be undone.
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
