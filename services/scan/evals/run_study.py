"""Run the validation study's photos through a scan service and record only the numbers.

    SCAN_API_URL=... SCAN_API_SECRET=... uv run python -m evals.run_study evals/data/photos

Expects <photos>/<participant_id>/<scan_no>-<fitted|loose>-front.jpg and ...-side.jpg, and
evals/data/participants.csv for each participant's measured height (and weight, age, sex).
Writes evals/data/scans.csv. Photos are read from disk and sent; nothing else is kept. Delete the
photo folder at the end of the study and record that you did (the study consent says so).
"""

import csv
import hashlib
import os
import sys
import time
import urllib.request
import uuid
from pathlib import Path

from app.auth import sign

DATA = Path(__file__).with_name("data")


def multipart(files: dict[str, bytes], fields: dict[str, str]) -> tuple[bytes, str]:
    boundary = "----fitdna" + uuid.uuid4().hex
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()
    ]
    for name, data in files.items():
        head = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}.jpg"\r\n'
            "Content-Type: image/jpeg\r\n\r\n"
        )
        parts.append(head.encode() + data + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def scan(url: str, secret: str, front: bytes, side: bytes, fields: dict[str, str]) -> dict:
    import json

    if not url.startswith(("https://", "http://127.0.0.1", "http://localhost")):
        raise ValueError("SCAN_API_URL must be https (or a local stub)")
    body, content_type = multipart({"front": front, "side": side}, fields)
    scan_id, ts, digest = str(uuid.uuid4()), int(time.time()), hashlib.sha256(body).hexdigest()
    request = urllib.request.Request(  # noqa: S310 (scheme checked above)
        url.rstrip("/") + "/v1/scan",
        data=body,
        method="POST",
        headers={
            "Content-Type": content_type,
            "X-FitDNA-Timestamp": str(ts),
            "X-FitDNA-Scan-Id": scan_id,
            "X-FitDNA-Content-SHA256": digest,
            "X-FitDNA-Signature": sign(secret, ts, scan_id, digest),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:  # noqa: S310 (scheme checked above)
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        return json.loads(error.read() or b"{}")


def main(photos: Path) -> None:
    url, secret = os.environ["SCAN_API_URL"], os.environ["SCAN_API_SECRET"]
    people = {p["participant_id"]: p for p in csv.DictReader((DATA / "participants.csv").open())}
    rows = []
    for front in sorted(photos.glob("*/*-front.jpg")):
        pid = front.parent.name
        scan_no, clothing, _ = front.stem.split("-")
        p = people[pid]
        fields = {"height_cm": p["height_cm"], "weight_kg": p["weight_kg"], "age": p["age"], "sex": p["sex"]}
        result = scan(
            url, secret, front.read_bytes(), front.with_name(front.name.replace("-front", "-side")).read_bytes(), fields
        )
        if "error" in result:
            print(f"{pid} scan {scan_no}: {result['error']}")
            continue
        m = result["measurements"]
        rows.append(
            {
                "participant_id": pid,
                "scan_no": scan_no,
                "clothing": clothing,
                **{f: m[f]["value_cm"] for f in ("chest", "shoulder", "arm")},
            }
        )
        print(f"{pid} scan {scan_no} ({clothing}): ok")
    with (DATA / "scans.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["participant_id", "scan_no", "clothing", "chest", "shoulder", "arm"])
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
