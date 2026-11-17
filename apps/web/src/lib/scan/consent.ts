/**
 * What a photo scan asks agreement to, shown on /passport/scan/consent and recorded as a
 * `consents` row with scope `scan`. Separate from the body-data consent, which a scan
 * also needs. Bump SCAN_CONSENT_POLICY_VERSION whenever this text changes.
 */

export const SCAN_CONSENT_POLICY_VERSION = "2026-11-16";

export const SCAN_CONSENT_TERMS: ReadonlyArray<readonly [string, string]> = [
  [
    "What you give",
    "Two photos of yourself, from the front and from the side, in fitted clothing, and your height. Weight, age and sex are optional; they help the estimate and aren't kept.",
  ],
  [
    "What we make, and keep",
    "Estimates of your chest, shoulder width and arm length, each with a likely error; you choose which ones to use. And a 3D avatar of your body shape: a grey figure with the same generic head for everyone, no face, made from 20 shape numbers. We keep the avatar, the numbers it's made from, the estimates and the height you gave, with Supabase, encrypted.",
  ],
  [
    "Your photos",
    "Never stored. They go from your phone through our web host (Vercel) to our scan service (Modal Labs), both in the United States, are processed in memory in one request, and are gone when it ends, usually within two minutes. They're never logged, never used to train anything, never sent to AI language models and never shared.",
  ],
  [
    "Why",
    "Only to estimate your measurements for fit predictions and to show you your avatar. Not to identify you, and never sold.",
  ],
  [
    "How accurate",
    "Estimates. They haven't yet been checked against tape measurements on real people, so each comes with a range, and a tape measure is still the most reliable. Loose clothing makes them worse.",
  ],
  [
    "Who can scan",
    "Adults (18 or older) only, and only you in the photos. Ask someone to take them, or prop your phone up and use its timer. Not available in Illinois.",
  ],
  [
    "How long, and how to stop",
    "Until you delete them. Delete a scan or your avatar any time, withdraw this consent (which deletes your avatar, your scans and any measurements taken from them), or delete your account from Settings. Unfinished or failed scans are deleted after 30 days.",
  ],
];
