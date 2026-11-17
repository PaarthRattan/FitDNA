"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormError, SelectField, TextField, UnitChoice } from "@/components/form";
import { Button, LABEL } from "@/components/ui";
import { POSE_MESSAGES, type View } from "@/lib/scan/pose";
import { checkPhotoPose } from "./pose-check";
import { preparePhoto } from "./photo";

/**
 * The scan form: height (and optional weight, age, sex), then two photos taken with the
 * phone's own camera. Each photo is shrunk and re-encoded here, and its pose checked on
 * the phone, before anything is sent. Sending posts both photos to /api/scan in one
 * request, then goes to the scan's page, which waits for the result.
 */

type Shot =
  | { status: "empty" }
  | { status: "working" }
  | { status: "ready"; blob: Blob; preview: string; note: string | null }
  | { status: "problem"; message: string; preview?: string };

const VIEWS: Array<{ view: View; title: string; how: string[] }> = [
  {
    view: "front",
    title: "Front photo",
    how: [
      "Stand facing the camera, feet a little apart, arms held slightly away from your sides like an A.",
      "Your whole body in the frame, head to feet, with a little space around you.",
    ],
  },
  {
    view: "side",
    title: "Side photo",
    how: ["Turn so your right side faces the camera. Stand straight, arms relaxed at your sides.", "Again, head to feet in the frame."],
  },
];

const SEX_OPTIONS = [
  { value: "", label: "Rather not say" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

export function ScanCapture() {
  const router = useRouter();
  const [shots, setShots] = useState<Record<View, Shot>>({ front: { status: "empty" }, side: { status: "empty" } });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const previews = useRef<string[]>([]);

  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function pick(view: View, file: File | undefined) {
    if (!file) return;
    setShots((s) => ({ ...s, [view]: { status: "working" } }));
    const photo = await preparePhoto(file);
    if (!photo.ok) {
      setShots((s) => ({ ...s, [view]: { status: "problem", message: photo.message } }));
      return;
    }
    const preview = URL.createObjectURL(photo.blob);
    previews.current.push(preview);
    const check = await checkPhotoPose(photo.bitmap, view);
    photo.bitmap.close();
    if (check !== "unavailable" && !check.ok) {
      setShots((s) => ({ ...s, [view]: { status: "problem", message: POSE_MESSAGES[check.problem], preview } }));
      return;
    }
    const note = check === "unavailable" ? "We couldn't check this photo on your phone; the scan will check it." : null;
    setShots((s) => ({ ...s, [view]: { status: "ready", blob: photo.blob, preview, note } }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const front = shots.front;
    const side = shots.side;
    if (front.status !== "ready" || side.status !== "ready") {
      setErrors({ form: "Take both photos first." });
      return;
    }
    const body = new FormData(event.currentTarget);
    body.delete("front-file");
    body.delete("side-file");
    body.set("front", front.blob, "front.jpg");
    body.set("side", side.blob, "side.jpg");

    setSending(true);
    setErrors({});
    try {
      const response = await fetch("/api/scan", { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as {
        scanId?: string;
        message?: string;
        errors?: Record<string, string>;
      };
      if (response.status === 202 && json.scanId) {
        router.push(`/passport/scan/${json.scanId}`);
        return;
      }
      setErrors({ ...(json.errors ?? {}), form: json.message ?? "Couldn't start the scan. Please try again." });
    } catch {
      setErrors({ form: "Couldn't reach FitDNA. Check your connection and try again." });
    }
    setSending(false);
  }

  const ready = shots.front.status === "ready" && shots.side.status === "ready";

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <FormError message={errors.form} />

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg">1. About you</h2>
        <UnitChoice error={errors.unit} />
        <TextField
          id="height"
          label="Height"
          required
          numeric
          hint="Without shoes. The scan uses it to get the scale right, so be as exact as you can."
          error={errors.height}
        />
        <TextField id="weight" label="Weight (optional)" numeric hint="Kilograms, or pounds if you chose inches." error={errors.weight} />
        <TextField id="age" label="Age (optional)" numeric error={errors.age} />
        <SelectField
          id="sex"
          label="Sex (optional)"
          options={SEX_OPTIONS}
          hint="Body proportions differ on average between the sexes, so it sharpens the estimate. Weight, age and sex aren't kept."
          error={errors.sex}
        />
      </section>

      {VIEWS.map(({ view, title, how }, i) => (
        <section key={view} className="flex flex-col gap-3">
          <h2 className="font-display text-lg">
            {i + 2}. {title}
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            {how.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>Fitted clothing, like a T-shirt and leggings. Ask someone to take it, or prop your phone up and use its timer.</li>
          </ul>
          <ShotPicker view={view} shot={shots[view]} onPick={pick} error={errors[view]} />
        </section>
      ))}

      <section className="flex flex-col gap-3 border-t border-ink pt-4">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="adult" value="yes" required className="mt-1 accent-ink" aria-describedby={errors.adult ? "adult-error" : undefined} />
          <span>I&apos;m 18 or older, and I&apos;m the only person in these photos.</span>
        </label>
        {errors.adult && (
          <p id="adult-error" className="font-body text-xs text-primary font-bold">
            {errors.adult}
          </p>
        )}
        <p className="text-xs text-[#333] leading-[1.4]">
          Sending passes both photos through our web host to our scan service, where they&apos;re processed in memory and
          discarded. They&apos;re never stored. The scan takes a minute or two.
        </p>
        <div>
          <Button type="submit" disabled={!ready || sending}>
            {sending ? "Sending…" : "Start the scan"}
          </Button>
        </div>
      </section>
    </form>
  );
}

function ShotPicker({
  view,
  shot,
  onPick,
  error,
}: {
  view: View;
  shot: Shot;
  onPick: (view: View, file: File | undefined) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = `${view}-file`;
  const preview = shot.status === "ready" || shot.status === "problem" ? shot.preview : undefined;
  return (
    <div className="flex gap-3 items-start">
      <div className="w-24 h-32 shrink-0 border border-ink bg-tint-steel flex items-center justify-center overflow-hidden">
        {preview ? (
          // A local object URL of the user's own photo; next/image can't optimise those.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Your ${view} photo`} className="w-full h-full object-cover" />
        ) : (
          <span className="font-mono text-[11px] text-[#666] text-center px-1">{view.toUpperCase()}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <label htmlFor={id} className={`${LABEL} sr-only`}>
          {view === "front" ? "Front photo" : "Side photo"}
        </label>
        <input
          ref={input}
          id={id}
          name={id}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            onPick(view, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div>
          <Button variant={shot.status === "ready" ? "secondary" : "primary"} onClick={() => input.current?.click()} disabled={shot.status === "working"}>
            {shot.status === "working" ? "Checking…" : shot.status === "empty" ? "Take the photo" : "Take it again"}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="text-xs leading-[1.4]">
          {shot.status === "working" && "Checking the photo on your phone… The first check downloads the checker (about 15 MB)."}
          {shot.status === "ready" && (shot.note ?? "Looks good.")}
          {shot.status === "problem" && <b className="text-primary">{shot.message}</b>}
        </p>
        {error && <p className="font-body text-xs text-primary font-bold">{error}</p>}
      </div>
    </div>
  );
}
