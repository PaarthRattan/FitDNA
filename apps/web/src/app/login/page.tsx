import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { getUser } from "@/lib/db/auth";
import { safeNext } from "@/lib/safe-next";
import { supabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Send yourself a new one.",
  config: "Sign-in isn't set up on this server yet.",
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  const error = ERRORS[first(params.error) ?? ""];
  const user = await getUser();
  const configured = supabaseEnv() !== null;

  return (
    <>
      <TopBanner title="Sign in" />
      <Eyebrow tint="sky">Sign in</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-md">
          <CardTitleBar>
            <CardTitle>{user ? "YOU'RE SIGNED IN" : "EMAIL A SIGN-IN LINK"}</CardTitle>
          </CardTitleBar>
          <div className="p-4 flex flex-col gap-3 font-body text-sm">
            {error && (
              <p role="alert" className="text-primary">
                {error}
              </p>
            )}
            {!configured ? (
              <p>
                Sign-in needs a Supabase project. Add <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
                <code className="font-mono text-xs">.env.local</code>. Until then, the app runs on demo data.
              </p>
            ) : user ? (
              <>
                <p>
                  Signed in as <b>{user.email}</b>.
                </p>
                <div>
                  <Button href={next}>Continue</Button>
                </div>
              </>
            ) : (
              <>
                <p>No password. We email you a link that signs you in, and creates your account the first time.</p>
                <LoginForm next={next} />
              </>
            )}
          </div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
