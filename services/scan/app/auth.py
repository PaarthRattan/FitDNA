"""Request signing between the web app and this service.

The signature covers a timestamp, the scan id and the SHA-256 of the body, and is checked
from headers alone, before the body is read, so unauthenticated requests cost nothing.
The body is then hashed and compared with the signed hash.

    X-FitDNA-Timestamp:      unix seconds
    X-FitDNA-Scan-Id:        the scan's uuid
    X-FitDNA-Content-SHA256: hex sha256 of the body
    X-FitDNA-Signature:      hex HMAC-SHA256(secret, f"{timestamp}\\n{scan_id}\\n{content_sha256}")

The web app's src/lib/scan/client.ts builds the same string.
"""

import hashlib
import hmac
import re

MAX_SKEW_SECONDS = 300
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def sign(secret: str, timestamp: int, scan_id: str, content_sha256: str) -> str:
    message = f"{timestamp}\n{scan_id}\n{content_sha256}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_headers(headers: dict[str, str], secret: str, now: float) -> tuple[bool, str | None]:
    """(ok, content_sha256). Header names are matched case-insensitively."""
    h = {k.lower(): v for k, v in headers.items()}
    if not secret:
        return False, None
    try:
        timestamp = int(h.get("x-fitdna-timestamp", ""))
    except ValueError:
        return False, None
    scan_id = h.get("x-fitdna-scan-id", "")
    content_sha256 = h.get("x-fitdna-content-sha256", "")
    signature = h.get("x-fitdna-signature", "")
    if abs(now - timestamp) > MAX_SKEW_SECONDS:
        return False, None
    if not _UUID.match(scan_id) or not _HEX64.match(content_sha256) or not _HEX64.match(signature):
        return False, None
    expected = sign(secret, timestamp, scan_id, content_sha256)
    return hmac.compare_digest(expected, signature), content_sha256


def body_matches(body: bytes, content_sha256: str) -> bool:
    return hmac.compare_digest(hashlib.sha256(body).hexdigest(), content_sha256)
