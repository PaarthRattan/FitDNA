"""From raw measurements to what's reported: calibrated value, ± range and confidence.

range = sqrt(calibration error² + disagreement²), never below the field's floor, where the
disagreement is |front-only − side-only| when the two views were fitted separately. Large
disagreement or loose clothing lowers confidence. calibration.json holds the numbers; until the
validation study (M6d) fills it, the errors are literature values and the corrections are zero.
"""

import json
import math
from functools import lru_cache
from pathlib import Path

from .schema import Measurement

CALIBRATION = Path(__file__).with_name("calibration.json")
REPORTED = ("chest", "shoulder", "arm", "waist", "hip")


@lru_cache(maxsize=1)
def calibration() -> dict:
    return json.loads(CALIBRATION.read_text())


def report(
    raw: dict[str, float],
    disagreement: dict[str, float] | None = None,
    loose_clothing: bool = False,
) -> dict[str, Measurement]:
    cal = calibration()
    out: dict[str, Measurement] = {}
    for name in REPORTED:
        if name not in raw:
            continue
        field = cal["fields"][name]
        value = raw[name] * field["scale"] + field["offset_cm"]
        dis = (disagreement or {}).get(name)
        error = field["error_cm"]
        flags: list[str] = []
        confidence = field["confidence"]
        if name == "chest" and loose_clothing:
            error = math.hypot(error, cal["loose_clothing"]["chest_extra_cm"])
            confidence -= cal["loose_clothing"]["confidence_penalty"]
            flags.append("loose_clothing")
        if dis is not None:
            error = math.hypot(error, dis)
            if dis > field["error_cm"]:
                confidence -= 10
                flags.append("views_disagree")
        if not cal["validated"]:
            flags.append("unvalidated")
        out[name] = Measurement(
            value_cm=round(value, 1),
            range_cm=round(max(error, field["floor_cm"]), 1),
            confidence=max(0, min(100, int(confidence))),
            disagreement_cm=round(dis, 1) if dis is not None else None,
            flags=flags,
        )
    return out
