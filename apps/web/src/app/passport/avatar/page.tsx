import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { loadAvatar } from "@/lib/db/scan";
import { deleteAvatar } from "../actions";
import { AvatarViewer } from "./avatar-viewer";

export const metadata: Metadata = { title: "Your avatar" };

/** The user's avatar from their latest scan: body shape only, same generic head for everyone. */
export default async function AvatarPage() {
  const avatar = await loadAvatar("/passport/avatar");

  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="salmon">Your avatar</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>YOUR BODY SHAPE</CardTitle>
            {avatar && <CardSub>From your scan on {formatDate(avatar.createdAt)}</CardSub>}
          </CardTitleBar>
          <div className="p-4 flex flex-col gap-4 font-body text-sm leading-[1.45]">
            {!avatar ? (
              <>
                <p>You don&apos;t have an avatar. A photo scan makes one: a grey figure of your body shape, with no face.</p>
                <div>
                  <Button href="/passport/scan">Scan</Button>
                </div>
              </>
            ) : (
              <>
                {avatar.url ? (
                  <AvatarViewer url={avatar.url} />
                ) : (
                  <p>Your avatar&apos;s file couldn&apos;t be found. Delete it and scan again to make a new one.</p>
                )}
                <p className="text-xs text-[#333]">
                  Made from 20 body-shape numbers estimated from your photos. Every avatar has the same generic head; your
                  face isn&apos;t in it. It&apos;s only an estimate, and only you can see it.
                </p>
                <div className="flex gap-2 flex-wrap border-t border-ink pt-3">
                  <Button href="/passport/scan">Scan again</Button>
                  <form action={deleteAvatar}>
                    <Button type="submit" variant="secondary">
                      Delete my avatar
                    </Button>
                  </form>
                </div>
              </>
            )}
          </div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}
