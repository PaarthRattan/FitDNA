# Scan validation study (M6d)

The scan is enabled for real users only if it beats the alternatives on real people. This folder holds the protocol and the scripts; the data never leaves the developer's machine and is never committed (`evals/data/` is gitignored).

## Before the study

- Legal: run the study's processing on a GPU you control in Quebec if you can. If the photos go to Modal (US), the Law 25 s. 17 privacy impact assessment and the Modal DPA must be done first, not just before launch.
- Consent form for participants (adults only), separate from the app's: what is photographed, where it is processed, that photos are kept encrypted on one laptop for the study only and then deleted, that only numbers are kept afterwards, and that they can withdraw.
- Recruit at least 30 adults: about 10 per height tertile and 10 per BMI tertile, both sexes.

## Tape protocol (one trained measurer, helper-taken, each measurement twice)

Light, fitted clothing for tape and fitted scans. Subject standing relaxed, feet together, breathing normally; measure at the end of a normal breath out.

- **Chest:** level, around the fullest part of the chest, just under the arms. Snug, not compressing. Tape horizontal all the way round (check in a mirror).
- **Shoulder (across the back):** from the bony tip of one shoulder (acromion) to the other, over the back at the base of the neck, following the curve.
- **Arm:** from the acromion, down the outside of a slightly bent arm (elbow about 20°), over the elbow, to the wrist bone (ulnar styloid).
- **Height:** measured on site with a stadiometer or a wall rule, shoes off. Also record the participant's self-reported height.

Record both readings; the scripts average them.

## Scans

Three per participant, re-entering the app's capture flow each time: two in fitted clothing, one in the participant's usual loose top or jacket. Same phone model throughout if possible; record the phone.

## Running

```bash
# photos: evals/data/photos/<participant_id>/<scan_no>-<fitted|loose>-front.jpg and -side.jpg
SCAN_API_URL=... SCAN_API_SECRET=... uv run python -m evals.run_study evals/data/photos
uv run python -m evals.validate          # writes evals/last-run.md with the go/no-go table
```

Then delete `evals/data/photos/` and note the date in the study log. Record the go/no-go outcome in `design/ROADMAP.md`, and copy the per-field correction and error into `app/calibration.json` (`validated: true`), bumping `MEASURE_VERSION`.

## Go / no-go (fitted clothing; all must hold)

- shoulder MAE below the statistics-only estimate and at most 1.5 cm;
- arm MAE below the statistics-only estimate and at most 2.0 cm;
- chest MAE at most 2.7 cm (an untrained self-tape), with bias within ±1.5 cm in every height and BMI tertile;
- repeatability (SD across a person's fitted scans) at most 1.0 cm for shoulder and arm, 2.0 cm for chest;
- loose clothing: chest MAE at most 4 cm.

Otherwise ship the statistics pre-fill and keep the scan allow-listed.

## Synthetic check (no people)

`uv run python -m evals.synthetic_refine --bodies 20` measures whether two-view refinement recovers known MHR bodies. It says nothing about real photos, clothing or segmentation.
