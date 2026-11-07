import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FooterNav, TopBanner } from "@/components/chrome";
import { Button, Card, CardSub, CardTitle, CardTitleBar, Eyebrow } from "@/components/ui";
import { loadReference } from "@/lib/db/passport";
import { formatCm } from "@/lib/fit/templates";
import { categoryLabel } from "@/lib/passport/mappers";
import { deleteReference } from "../../actions";
import { GarmentForm } from "../garment-form";

export const metadata: Metadata = { title: "Edit reference garment" };

type Params = Promise<{ id: string }>;

const cm = (value: number | null) => (value === null ? "" : formatCm(value));

export default async function EditGarmentPage({ params }: { params: Params }) {
  const { id } = await params;
  const garment = await loadReference(id, `/passport/garments/${id}`);
  if (!garment) notFound();

  return (
    <>
      <TopBanner title="Fit Passport" />
      <Eyebrow tint="sky">Edit reference garment</Eyebrow>
      <main className="p-5 flex-1 flex flex-col gap-5">
        <Card className="max-w-2xl">
          <CardTitleBar>
            <CardTitle>{garment.title.toUpperCase()}</CardTitle>
            <CardSub>{categoryLabel(garment.category)}</CardSub>
          </CardTitleBar>
          <div className="p-4">
            <GarmentForm
              initial={{
                id: garment.id,
                title: garment.title,
                category: garment.category,
                sizeLabel: garment.size_label ?? "",
                unit: "cm",
                chest: cm(garment.chest_cm),
                chestBasis: garment.chest_basis,
                shoulder: cm(garment.shoulder_cm),
                length: cm(garment.length_cm),
                sleeve: cm(garment.sleeve_cm),
                stretch: garment.stretch,
                fitZone: garment.fit_zone,
              }}
            />
          </div>
        </Card>
        <form action={deleteReference} className="max-w-2xl">
          <input type="hidden" name="id" value={garment.id} />
          <Button type="submit" variant="secondary" size="sm">
            Delete this garment
          </Button>
        </form>
      </main>
      <FooterNav />
    </>
  );
}
