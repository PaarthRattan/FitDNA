"""Fit the statistics model from ANSUR II and write coefficients.json. Run by hand, offline:

    uv run python -m app.stats.fit            # reads .cache/ansur/ANSUR_II_{MALE,FEMALE}_Public.csv

ANSUR II (US Army, 2012; public CSVs at https://www.openlab.psu.edu/ansur2/): lengths in mm,
weight in hectograms despite the column name "weightkg". The page states no licence; confirm
before shipping these coefficients to real users (a launch gate). Only coefficients are
committed, never the data.

Per sex and pooled, one ordinary least-squares model per target and per available set of inputs
(height+weight+age, height+weight, height+age, height), with 5-fold cross-validated MAE.
The shoulder arc (FitDNA's across-the-back shoulder) isn't in ANSUR; it's mapped from biacromial
breadth with a line fitted on MHR bodies (needs the `body` extra and assets; skipped otherwise).
"""

import csv
import json
import sys
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / ".cache" / "ansur"
OUT = Path(__file__).with_name("coefficients.json")

TARGETS = {
    "chest": "chestcircumference",
    "shoulder_biacromial": "biacromialbreadth",
    "arm": "sleeveoutseam",
    "waist": "waistcircumference",
    "hip": "buttockcircumference",
}
INPUT_SETS = {"hwa": ["height", "weight", "age"], "hw": ["height", "weight"], "ha": ["height", "age"], "h": ["height"]}


def load(sex: str) -> dict[str, np.ndarray]:
    path = DATA / f"ANSUR_II_{sex.upper()}_Public.csv"
    with path.open(newline="", encoding="latin-1") as f:
        rows = list(csv.DictReader(f))
    col = {k.lower(): k for k in rows[0]}

    def num(name: str, scale: float) -> np.ndarray:
        return np.array([float(r[col[name]]) * scale for r in rows])

    data = {
        "height": num("stature", 0.1),
        "weight": num("weightkg", 0.1),  # hectograms -> kg
        "age": num("age", 1.0),
    }
    for target, column in TARGETS.items():
        data[target] = num(column, 0.1)  # mm -> cm
    return data


def fit_ols(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float]:
    design = np.column_stack([np.ones(len(x)), x])
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    residual = y - design @ beta
    return beta, float(residual.std(ddof=design.shape[1]))


def cv_mae(x: np.ndarray, y: np.ndarray, folds: int = 5, seed: int = 0) -> float:
    order = np.random.default_rng(seed).permutation(len(y))
    errors = []
    for k in range(folds):
        test = order[k::folds]
        train = np.setdiff1d(order, test)
        beta, _ = fit_ols(x[train], y[train])
        errors.append(np.abs(np.column_stack([np.ones(len(test)), x[test]]) @ beta - y[test]))
    return float(np.concatenate(errors).mean())


def fit_group(data: dict[str, np.ndarray]) -> dict:
    out: dict = {}
    for set_name, inputs in INPUT_SETS.items():
        x = np.column_stack([data[i] for i in inputs])
        out[set_name] = {}
        for target in TARGETS:
            beta, sd = fit_ols(x, data[target])
            out[set_name][target] = {
                "intercept": round(float(beta[0]), 5),
                "coef": [round(float(b), 6) for b in beta[1:]],
                "sd": round(sd, 3),
                "cv_mae": round(cv_mae(x, data[target]), 3),
            }
    return out


def shoulder_arc_line(samples: int = 400) -> dict | None:
    try:
        from app.body.measure import measure
        from app.body.model import load as load_model
    except ImportError:
        return None
    model = load_model(1)
    rng = np.random.default_rng(42)
    rows = []
    for _ in range(samples):
        coeffs = rng.normal(0, 1, 20)
        scales = {n: float(rng.normal(0, 0.05)) for n in model.scale_names}
        m = measure(model.geometry(coeffs, scales))
        rows.append((m["shoulder_biacromial"], m["shoulder"]))
    b, a = np.array(rows).T
    beta, sd = fit_ols(b[:, None], a)
    return {
        "intercept": round(float(beta[0]), 4),
        "slope": round(float(beta[1]), 5),
        "sd": round(sd, 3),
        "source": f"MHR 1.0.1, {samples} random bodies (20 body coefficients ~ N(0,1), scales ~ N(0,0.05))",
    }


def main() -> None:
    male, female = load("male"), load("female")
    pooled = {k: np.concatenate([male[k], female[k]]) for k in male}
    result = {
        "source": (
            "ANSUR II public CSVs (US Army 2012, https://www.openlab.psu.edu/ansur2/); "
            f"n male={len(male['height'])}, female={len(female['height'])}. No licence stated on the source page: "
            "confirm before shipping to real users."
        ),
        "fitted": date.today().isoformat(),
        "inputs": {k: v for k, v in INPUT_SETS.items()},
        "units": {"height": "cm", "weight": "kg", "age": "years", "outputs": "cm"},
        "targets": TARGETS,
        "models": {"male": fit_group(male), "female": fit_group(female), "any": fit_group(pooled)},
        "shoulder_arc_from_biacromial": shoulder_arc_line(),
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    for group in ("male", "female", "any"):
        best = result["models"][group]["hwa"]
        print(group, {t: best[t]["cv_mae"] for t in TARGETS})
    print("arc line:", result["shoulder_arc_from_biacromial"])
    print("wrote", OUT)


if __name__ == "__main__":
    sys.exit(main())
