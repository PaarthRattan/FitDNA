"""The validation harness runs on made-up data (generated here, never real participants) and reaches a verdict."""

import csv

import numpy as np


def write(path, rows):
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def make_study(tmp_path, scan_noise_cm: float):
    from app.stats.prior import predict

    rng = np.random.default_rng(0)
    people, scans = [], []
    for i in range(30):
        sex = "male" if i % 2 else "female"
        height, weight, age = rng.normal(172, 9), rng.normal(75, 12), int(rng.integers(20, 60))
        truth = {k: v.value_cm + rng.normal(0, 2) for k, v in predict(height, weight, age, sex).items()}
        row = {
            "participant_id": f"p{i:02d}",
            "sex": sex,
            "height_cm": round(height, 1),
            "height_self_cm": round(height + 1, 1),
        }
        row |= {"weight_kg": round(weight, 1), "age": age}
        for f in ("chest", "shoulder", "arm"):
            row[f"tape_{f}_1"] = round(truth[f] + rng.normal(0, 0.3), 1)
            row[f"tape_{f}_2"] = round(truth[f] + rng.normal(0, 0.3), 1)
        people.append(row)
        for n, clothing in ((1, "fitted"), (2, "fitted"), (3, "loose")):
            noise = scan_noise_cm * (2 if clothing == "loose" else 1)
            scans.append(
                {"participant_id": row["participant_id"], "scan_no": n, "clothing": clothing}
                | {f: round(truth[f] + rng.normal(0, noise), 1) for f in ("chest", "shoulder", "arm")}
            )
    write(tmp_path / "participants.csv", people)
    write(tmp_path / "scans.csv", scans)


def run(tmp_path, monkeypatch):
    import evals.validate as v

    monkeypatch.setattr(v, "DATA", tmp_path)
    monkeypatch.setattr(v, "OUT", tmp_path / "last-run.md")
    v.main()
    return (tmp_path / "last-run.md").read_text()


def test_an_accurate_scan_gets_a_go(tmp_path, monkeypatch):
    make_study(tmp_path, scan_noise_cm=0.3)
    assert "**GO" in run(tmp_path, monkeypatch)


def test_a_noisy_scan_gets_a_no_go(tmp_path, monkeypatch):
    make_study(tmp_path, scan_noise_cm=4.0)
    report = run(tmp_path, monkeypatch)
    assert "**NO-GO" in report and "| stats only |" in report
