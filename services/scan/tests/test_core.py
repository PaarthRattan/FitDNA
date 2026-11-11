"""CPU-only tests: no body model, no GPU. Run in CI."""

import math

import numpy as np
import pytest

from app.auth import body_matches, sign, verify_headers
from app.body.geometry import arc_between, convex_hull_2d, horizontal_girth, hull_perimeter
from app.stats.prior import predict
from app.uncertainty import report
from app.validate import (
    MAX_IMAGE_BYTES,
    Rejected,
    decode_image,
    parse_fields,
    parse_multipart,
    parse_upload,
    sniff_image_type,
)
from tests.conftest import SECRET, elliptic_cylinder, jpeg, multipart, signed_headers

# --------------------------------------------------------------------------- auth


def test_signature_round_trip_and_tamper():
    body = b"hello"
    headers = signed_headers(body, "text/plain")
    ok, digest = verify_headers(headers, SECRET, now=float(headers["x-fitdna-timestamp"]))
    assert ok and body_matches(body, digest)
    assert not body_matches(b"hellO", digest)
    assert verify_headers(headers, "other-secret", now=float(headers["x-fitdna-timestamp"]))[0] is False
    stale = float(headers["x-fitdna-timestamp"]) + 301
    assert verify_headers(headers, SECRET, now=stale)[0] is False
    forged = dict(headers, **{"x-fitdna-scan-id": "00000000-0000-4000-8000-000000000000"})
    assert verify_headers(forged, SECRET, now=float(headers["x-fitdna-timestamp"]))[0] is False
    assert verify_headers(headers, "", now=float(headers["x-fitdna-timestamp"]))[0] is False


def test_signature_format_matches_the_web_app():
    # Same inputs as src/lib/scan/client.test.ts; both must produce this value.
    assert sign("s3cret", 1762870000, "11111111-2222-4333-8444-555555555555", "a" * 64) == (
        "0710228f1d0b461cf0115b921f8577da4bcb84b387f54abe73cb751ff817ab59"
    )


# --------------------------------------------------------------------------- validation


def test_images_are_sniffed_decoded_and_bounded():
    assert sniff_image_type(jpeg()) == "image/jpeg"
    assert sniff_image_type(b"<svg>") is None
    assert decode_image(jpeg()).shape == (900, 600, 3)
    for bad, code in [(b"<html>", "bad_image"), (jpeg(300, 300), "bad_image"), (jpeg(600, 2400), "too_large")]:
        with pytest.raises(Rejected) as e:
            decode_image(bad)
        assert e.value.code == code
    with pytest.raises(Rejected) as e:
        decode_image(b"\xff\xd8\xff" + b"0" * (MAX_IMAGE_BYTES + 1))
    assert e.value.code == "too_large"


def test_fields_are_checked():
    assert parse_fields({"height_cm": "180", "weight_kg": "80", "age": "30", "sex": "male"}).weight_kg == 80
    assert parse_fields({"height_cm": "165.5"}).sex is None
    for form, code in [
        ({}, "bad_height"),
        ({"height_cm": "90"}, "bad_height"),
        ({"height_cm": "nan"}, "bad_height"),
        ({"height_cm": "170", "weight_kg": "1000"}, "bad_request"),
        ({"height_cm": "170", "age": "12"}, "bad_request"),
        ({"height_cm": "170", "sex": "x"}, "bad_request"),
    ]:
        with pytest.raises(Rejected) as e:
            parse_fields(form)
        assert e.value.code == code


def test_multipart_is_parsed_in_memory_and_strict():
    body, ctype = multipart({"front": jpeg(), "side": jpeg()}, {"height_cm": "175"})
    files, fields = parse_multipart(ctype, body)
    assert set(files) == {"front", "side"} and fields == {"height_cm": "175"}
    upload = parse_upload(ctype, body)
    assert upload.fields.height_cm == 175 and upload.front.shape[2] == 3
    with pytest.raises(Rejected):
        parse_upload(*reversed(multipart({"front": jpeg()}, {"height_cm": "175"})))
    with pytest.raises(Rejected):
        parse_upload("application/json", body)


# --------------------------------------------------------------------------- geometry


def test_hull_perimeter_of_a_square_ignores_inner_points():
    pts = np.array([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [0.5, 1.5]], dtype=float)
    assert len(convex_hull_2d(pts)) == 4
    assert hull_perimeter(pts) == pytest.approx(8.0)


def test_girth_of_an_elliptic_tube_matches_the_ellipse():
    a, b = 18.0, 12.0
    v, f = elliptic_cylinder(a, b)
    ramanujan = math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))
    assert horizontal_girth(v, f, 5.0) == pytest.approx(ramanujan, rel=0.002)
    assert horizontal_girth(v, f, 50.0) == 0.0


def test_girth_bridges_hollows_like_a_tape():
    v, f = elliptic_cylinder(10.0, 10.0)
    dent = (v[:, 2] > 9.0) & (v[:, 1] > 1) & (v[:, 1] < 9)
    v = v.copy()
    v[dent, 2] -= 3.0  # push the front in
    assert horizontal_girth(v, f, 5.0) == pytest.approx(2 * math.pi * 10, rel=0.01)


def test_arc_over_the_back_of_a_tube_is_half_its_circumference():
    r = 10.0
    v, f = elliptic_cylinder(r, r)
    arc = arc_between(v, f, np.array([-r, 5.0, 0.0]), np.array([r, 5.0, 0.0]), np.array([0.0, 5.0, -r]))
    assert arc == pytest.approx(math.pi * r, rel=0.005)


# --------------------------------------------------------------------------- statistics and uncertainty


def test_stats_prediction_is_sensible_and_falls_back():
    tall = predict(190, 90, 35, "male")
    short = predict(160, 55, 35, "female")
    for k in ("chest", "shoulder", "arm"):
        assert tall[k].value_cm > short[k].value_cm
    assert 95 < tall["chest"].value_cm < 115 and 50 < tall["arm"].value_cm < 70
    assert tall["chest"].sd_cm < predict(190)["chest"].sd_cm  # weight matters most for chest
    assert predict(175)["shoulder"].value_cm > 0  # height only, sex unknown


def test_report_applies_floors_disagreement_and_flags():
    out = report({"chest": 100.0, "shoulder": 46.0, "arm": 58.0}, {"chest": 5.0, "shoulder": 0.2}, loose_clothing=True)
    assert (
        out["chest"].range_cm > 5 and "loose_clothing" in out["chest"].flags and "views_disagree" in out["chest"].flags
    )
    assert out["chest"].confidence < 45
    assert out["shoulder"].range_cm == 1.5 and out["arm"].range_cm == 2.0
    assert all("unvalidated" in m.flags for m in out.values())
