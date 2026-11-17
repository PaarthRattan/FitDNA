/**
 * Tunable limits for photo scans. Change them here, never inline. The scan service
 * (services/scan/app/validate.py) enforces its own copies of the size limits.
 */

/** Scans one user may start per rolling 24 hours. Each one costs GPU time. */
export const SCAN_DAILY_CAP = 3;

/**
 * Scan consents one user may grant per rolling 24 hours. Withdrawing deletes their scans,
 * which would otherwise reset the daily cap; consents are never deleted, so this bounds
 * it. Withdrawing is never limited.
 */
export const SCAN_CONSENT_DAILY_GRANTS = 3;

/** Photos are resized in the browser so the long side is at most this, then sent as JPEG. */
export const SCAN_PHOTO_LONG_SIDE_PX = 1280;
export const SCAN_PHOTO_JPEG_QUALITY = 0.85;
/** The service refuses photos whose short side is under this. */
export const SCAN_PHOTO_MIN_SHORT_SIDE_PX = 480;

/** Per photo. Matches the service's MAX_IMAGE_BYTES. */
export const SCAN_MAX_IMAGE_BYTES = 900 * 1024;
/**
 * The whole request to the service. Under Modal's 2 MiB limit, above which a web
 * request's body is kept in US object storage; the service refuses anything larger.
 */
export const SCAN_MAX_SERVICE_BODY_BYTES = 1_900_000;
/** The browser's upload to our Route Handler: two photos, a few fields, multipart overhead. */
export const SCAN_MAX_UPLOAD_BYTES = 2 * SCAN_MAX_IMAGE_BYTES + 64 * 1024;

export const SCAN_HEIGHT_MIN_CM = 120;
export const SCAN_HEIGHT_MAX_CM = 230;
export const SCAN_WEIGHT_MIN_KG = 30;
export const SCAN_WEIGHT_MAX_KG = 250;
export const SCAN_AGE_MIN = 18;
export const SCAN_AGE_MAX = 100;

/**
 * How long the service may take, from our side. Inside the Route Handler's
 * `maxDuration` (300 s), with room to store the result afterwards.
 */
export const SCAN_TIMEOUT_MS = 240_000;
/**
 * A scan still pending after this long was cut off (the platform stopped the
 * function), so it's shown as timed out rather than polled forever.
 */
export const SCAN_STALE_SECONDS = 320;

/** The private Storage bucket for avatar files: one folder per user, `<user id>/<scan id>.glb`. */
export const AVATAR_BUCKET = "avatars";
export const avatarPath = (userId: string, scanId: string) => `${userId}/${scanId}.glb`;

/** The avatar file the service returns, at most. The bucket allows 2 MB. */
export const AVATAR_MAX_BYTES = 600 * 1024;
/** Signed links to the avatar file last this long: enough to load it once. */
export const AVATAR_LINK_SECONDS = 60;

/**
 * The most confidence (0–100) a scanned value may carry, whatever the service says,
 * until the validation study (M6d) has measured the scan against tape on real people.
 * Typed-in tape measurements carry 60.
 */
export const SCAN_MAX_CONFIDENCE = { chest: 45, shoulder: 55, arm: 55 } as const;
/** And the least uncertainty (± cm) it may claim. */
export const SCAN_MIN_RANGE_CM = { chest: 3.0, shoulder: 1.5, arm: 2.0 } as const;
