import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { loadPassport } from "@/lib/db/passport";
import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Fit notes" };

export default async function PreferencesPage() {
  const passport = await loadPassport("/passport/preferences");
  const initial = Object.fromEntries(passport.preferences.map((p) => [p.category, p.text]));

  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="lime">Fit notes</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>WHAT “GOOD FIT” MEANS TO YOU</CardTitle>
            <CardSub>In your own words, per kind of garment. Leave any blank.</CardSub>
          </CardTitleBar>
          <div className="p-4">
            <PreferencesForm initial={initial} />
          </div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
