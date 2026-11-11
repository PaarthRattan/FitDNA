"""M6d validation: scan measurements against helper-taken tape, with the go/no-go decision.

    uv run python -m evals.validate                     # reads evals/data/, writes evals/last-run.md

Inputs (in evals/data/, gitignored; never commit them):
  participants.csv  participant_id, sex, height_cm (measured on site), height_self_cm, weight_kg, age,
                    tape_chest_1, tape_chest_2, tape_shoulder_1, tape_shoulder_2, tape_arm_1, tape_arm_2
  scans.csv         participant_id, scan_no, clothing (fitted|loose), chest, shoulder, arm   (from run_study.py)

Reports MAE, bias, P90 absolute error and repeatability per field, split by height and BMI tertile
and by clothing, next to the statistics-only baseline from the same participants' height, weight,
age and sex. The go/no-go rules are the plan's (M6d); all must hold in fitted clothing.
"""

import csv
from collections import defaultdict
from pathlib import Path

import numpy as np

from app.stats.prior import predict

DATA = Path(__file__).with_name("data")
OUT = Path(__file__).with_name("last-run.md")
FIELDS = ("chest", "shoulder", "arm")


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def tertiles(values: np.ndarray) -> np.ndarray:
    cuts = np.quantile(values, [1 / 3, 2 / 3])
    return np.digitize(values, cuts)


def summary(errors: np.ndarray) -> dict[str, float]:
    if len(errors) == 0:
        return {"n": 0, "mae": float("nan"), "bias": float("nan"), "p90": float("nan")}
    return {
        "n": len(errors),
        "mae": float(np.abs(errors).mean()),
        "bias": float(errors.mean()),
        "p90": float(np.percentile(np.abs(errors), 90)),
    }


def main() -> None:
    people = {p["participant_id"]: p for p in load_csv(DATA / "participants.csv")}
    scans = load_csv(DATA / "scans.csv")
    tape = {
        pid: {f: (float(p[f"tape_{f}_1"]) + float(p[f"tape_{f}_2"])) / 2 for f in FIELDS} for pid, p in people.items()
    }
    stats = {
        pid: predict(float(p["height_cm"]), float(p["weight_kg"]), int(float(p["age"])), p["sex"])
        for pid, p in people.items()
    }
    ids = sorted(people)
    heights = np.array([float(people[i]["height_cm"]) for i in ids])
    bmi = np.array([float(people[i]["weight_kg"]) / (float(people[i]["height_cm"]) / 100) ** 2 for i in ids])
    height_tertile = dict(zip(ids, tertiles(heights), strict=True))
    bmi_tertile = dict(zip(ids, tertiles(bmi), strict=True))

    lines = ["# Scan validation", "", f"{len(people)} participants, {len(scans)} scans.", ""]
    verdict: list[tuple[str, bool]] = []
    fitted = [s for s in scans if s["clothing"] == "fitted"]
    loose = [s for s in scans if s["clothing"] == "loose"]

    for field in FIELDS:
        scan_err = np.array([float(s[field]) - tape[s["participant_id"]][field] for s in fitted])
        stats_err = np.array([stats[i][field].value_cm - tape[i][field] for i in ids])
        per_person = defaultdict(list)
        for s in fitted:
            per_person[s["participant_id"]].append(float(s[field]))
        repeat_sd = float(np.mean([np.std(v, ddof=1) for v in per_person.values() if len(v) > 1] or [np.nan]))
        sc, st = summary(scan_err), summary(stats_err)
        lines += [
            f"## {field}",
            "",
            "| | n | MAE | bias | P90 |",
            "|---|---|---|---|---|",
            f"| scan, fitted | {sc['n']} | {sc['mae']:.2f} | {sc['bias']:+.2f} | {sc['p90']:.2f} |",
            f"| stats only | {st['n']} | {st['mae']:.2f} | {st['bias']:+.2f} | {st['p90']:.2f} |",
        ]
        if loose:
            lo = summary(np.array([float(s[field]) - tape[s["participant_id"]][field] for s in loose]))
            lines.append(f"| scan, loose | {lo['n']} | {lo['mae']:.2f} | {lo['bias']:+.2f} | {lo['p90']:.2f} |")
        for name, groups in (("height", height_tertile), ("BMI", bmi_tertile)):
            for t in range(3):
                e = np.array(
                    [
                        float(s[field]) - tape[s["participant_id"]][field]
                        for s in fitted
                        if groups[s["participant_id"]] == t
                    ]
                )
                g = summary(e)
                lines.append(
                    f"| scan, {name} tertile {t + 1} | {g['n']} | {g['mae']:.2f} | {g['bias']:+.2f} | {g['p90']:.2f} |"
                )
        lines += ["", f"Repeatability (mean SD across a person's fitted scans): {repeat_sd:.2f} cm", ""]

        if field == "chest":
            tertile_bias_ok = all(
                abs(
                    summary(
                        np.array(
                            [
                                float(s[field]) - tape[s["participant_id"]][field]
                                for s in fitted
                                if groups[s["participant_id"]] == t
                            ]
                        )
                    )["bias"]
                )
                <= 1.5
                for groups in (height_tertile, bmi_tertile)
                for t in range(3)
            )
            verdict += [
                ("chest MAE <= 2.7 cm (untrained self-tape)", sc["mae"] <= 2.7),
                ("chest bias within +/-1.5 cm in every tertile", tertile_bias_ok),
                ("chest repeatability <= 2.0 cm", repeat_sd <= 2.0),
            ]
            if loose:
                verdict.append(
                    (
                        "loose clothing: chest MAE <= 4 cm",
                        summary(np.array([float(s[field]) - tape[s["participant_id"]][field] for s in loose]))["mae"]
                        <= 4.0,
                    )
                )
        else:
            limit = 1.5 if field == "shoulder" else 2.0
            verdict += [
                (f"{field} MAE below stats-only", sc["mae"] < st["mae"]),
                (f"{field} MAE <= {limit} cm", sc["mae"] <= limit),
                (f"{field} repeatability <= 1.0 cm", repeat_sd <= 1.0),
            ]

    go = all(ok for _, ok in verdict)
    lines += ["## Go / no-go", "", *[f"- [{'x' if ok else ' '}] {name}" for name, ok in verdict], ""]
    lines.append(
        "**GO: the scan may be enabled for real users once the launch gates are met.**"
        if go
        else "**NO-GO: ship the statistics pre-fill, keep the scan allow-listed, and revisit.**"
    )
    OUT.write_text("\n".join(lines) + "\n")
    print("\n".join(lines[-len(verdict) - 4 :]))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
