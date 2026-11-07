import type { Metadata } from "next";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { requireUser } from "@/lib/db/auth";
import { GarmentForm } from "../garment-form";

export const metadata: Metadata = { title: "Add a reference garment" };

export default async function NewGarmentPage() {
  await requireUser("/passport/garments/new");
  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="sky">Add a reference garment</Eyebrow>
      <main className="p-5 flex-1">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>A PIECE YOU OWN AND KNOW WELL</CardTitle>
            <CardSub>Listings in the same category are compared against it.</CardSub>
          </CardTitleBar>
          <div className="p-4">
            <GarmentForm initial={{ unit: "cm", chestBasis: "flat", stretch: "none" }} />
          </div>
        </Card>
      </main>
      <FooterNav />
    </>
  );
}
