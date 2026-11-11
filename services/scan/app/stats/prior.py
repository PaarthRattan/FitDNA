"""Predict body measurements from height and, when given, weight, age and sex.

Uses coefficients.json (from fit.py). The web app has a TypeScript twin (src/lib/scan/stats.ts)
reading a copy of the same file; tests check they agree.
"""

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

COEFFICIENTS = Path(__file__).with_name("coefficients.json")


@dataclass(frozen=True)
class Estimate:
    value_cm: float
    sd_cm: float


@lru_cache(maxsize=1)
def coefficients() -> dict:
    return json.loads(COEFFICIENTS.read_text())


def _input_set(weight_kg: float | None, age: int | None) -> str:
    if weight_kg is not None and age is not None:
        return "hwa"
    if weight_kg is not None:
        return "hw"
    if age is not None:
        return "ha"
    return "h"


def predict(
    height_cm: float, weight_kg: float | None = None, age: int | None = None, sex: str | None = None
) -> dict[str, Estimate]:
    """chest, shoulder (across-the-back arc), shoulder_biacromial, arm, waist, hip; values and residual SDs in cm."""
    c = coefficients()
    group = sex if sex in ("male", "female") else "any"
    set_name = _input_set(weight_kg, age)
    inputs = {"height": height_cm, "weight": weight_kg, "age": age}
    x = [float(inputs[name]) for name in c["inputs"][set_name]]
    out: dict[str, Estimate] = {}
    for target, model in c["models"][group][set_name].items():
        value = model["intercept"] + sum(b * xi for b, xi in zip(model["coef"], x, strict=True))
        out[target] = Estimate(round(value, 1), model["sd"])
    arc = c.get("shoulder_arc_from_biacromial")
    if arc:
        b = out["shoulder_biacromial"]
        out["shoulder"] = Estimate(
            round(arc["intercept"] + arc["slope"] * b.value_cm, 1),
            round(math.hypot(arc["slope"] * b.sd_cm, arc["sd"]), 3),
        )
    return out
