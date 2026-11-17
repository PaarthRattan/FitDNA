import "server-only";
import { createHash, createHmac } from "node:crypto";
import { SCAN_MAX_SERVICE_BODY_BYTES, SCAN_TIMEOUT_MS } from "./constants";
import type { ScanUpload } from "./parse";
import { isScanError, type ScanError } from "./status";

/**
 * The scan service client (services/scan): one signed multipart POST per scan, over
 * plain `fetch`. The photos travel only in this request's body, in memory; nothing
 * here stores or logs them.
 *
 * Off unless SCAN_ENABLED=true and SCAN_API_URL and SCAN_API_SECRET are set, so CI
 * and local development never call a GPU by accident. SCAN_API_URL may point at
 * services/scan/stub_server.py. SCAN_ALLOWLIST_USER_IDS, when set, limits scanning
 * to those users (development only; it must be empty at launch).
 */

export const SCAN_API_SECRET_MIN_LENGTH = 32;

export function scanEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.SCAN_ENABLED === "true" &&
    serviceUrl(env.SCAN_API_URL) !== null &&
    (env.SCAN_API_SECRET?.length ?? 0) >= SCAN_API_SECRET_MIN_LENGTH
  );
}

export function scanAllowedForUser(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const list = (env.SCAN_ALLOWLIST_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(userId.toLowerCase());
}

/** The service's base URL: https, or plain http only to this machine (the stub). */
export function serviceUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (url.protocol !== "https:" && !local) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url.toString().replace(/\/+$/, "");
}

/** hex HMAC-SHA256(secret, "{timestamp}\n{scanId}\n{sha256 of the body}"); services/scan/app/auth.py checks it. */
export function signScanRequest(secret: string, timestamp: number, scanId: string, contentSha256: string): string {
  return createHmac("sha256", secret).update(`${timestamp}\n${scanId}\n${contentSha256}`).digest("hex");
}

/** Modal's proxy auth, in front of the service's own signature. Absent for the local stub. */
function proxyHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  const key = env.SCAN_PROXY_TOKEN_ID?.trim();
  const secret = env.SCAN_PROXY_TOKEN_SECRET?.trim();
  return key && secret ? { "Modal-Key": key, "Modal-Secret": secret } : {};
}

/** The multipart body exactly as it will be sent, so the signature covers these bytes. */
export async function scanRequestBody(upload: ScanUpload): Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string }> {
  const form = new FormData();
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
  form.append("front", new Blob([upload.front.bytes], { type: upload.front.type }), `front.${ext[upload.front.type]}`);
  form.append("side", new Blob([upload.side.bytes], { type: upload.side.type }), `side.${ext[upload.side.type]}`);
  form.append("height_cm", String(upload.heightCm));
  if (upload.weightKg !== null) form.append("weight_kg", String(upload.weightKg));
  if (upload.age !== null) form.append("age", String(upload.age));
  if (upload.sex !== null) form.append("sex", upload.sex);
  const request = new Request("http://body.invalid/", { method: "POST", body: form });
  const contentType = request.headers.get("content-type");
  if (!contentType) throw new Error("multipart body without a content type");
  return { body: new Uint8Array(await request.arrayBuffer()), contentType };
}

export type ScanCall = { ok: true; json: unknown } | { ok: false; error: ScanError; detail?: string };

/** What a service error status means for us, when its body doesn't say. */
function statusError(status: number): ScanError {
  if (status === 413) return "too_large";
  if (status === 429 || status === 503) return "busy";
  if (status === 504) return "timeout";
  return "failed";
}

export async function postScan(
  upload: ScanUpload,
  scanId: string,
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv; now?: () => number } = {},
): Promise<ScanCall> {
  const env = options.env ?? process.env;
  const base = serviceUrl(env.SCAN_API_URL);
  const secret = env.SCAN_API_SECRET ?? "";
  if (!scanEnabled(env) || !base) return { ok: false, error: "failed", detail: "disabled" };

  const { body, contentType } = await scanRequestBody(upload);
  if (body.byteLength > SCAN_MAX_SERVICE_BODY_BYTES) return { ok: false, error: "too_large" };
  const timestamp = Math.floor((options.now ?? Date.now)() / 1000);
  const digest = createHash("sha256").update(body).digest("hex");

  let response: Response;
  try {
    response = await fetch(`${base}/v1/scan`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": contentType,
        "X-FitDNA-Timestamp": String(timestamp),
        "X-FitDNA-Scan-Id": scanId,
        "X-FitDNA-Content-SHA256": digest,
        "X-FitDNA-Signature": signScanRequest(secret, timestamp, scanId, digest),
        ...proxyHeaders(env),
      },
      // A redirect would carry the signature and proxy secret to another URL: never follow one.
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? SCAN_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, error: timedOut ? "timeout" : "failed", detail: error instanceof Error ? error.name : "fetch" };
  }

  if (response.status >= 300 && response.status < 400) {
    // Modal answers a web request still running after 150 s with a 303 to poll; not supported.
    return { ok: false, error: "timeout", detail: `redirect ${response.status}` };
  }
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // An empty or non-JSON body: the status decides.
  }
  if (response.ok) return json === null ? { ok: false, error: "failed", detail: "not json" } : { ok: true, json };

  const code = typeof json === "object" && json !== null ? (json as { error?: unknown }).error : undefined;
  if (code === "unauthorized" || code === "bad_request") return { ok: false, error: "failed", detail: code };
  return { ok: false, error: isScanError(code) ? code : statusError(response.status), detail: `http ${response.status}` };
}

/**
 * Wakes the service while the user is still taking photos, so a cold start (up to a
 * minute on a GPU) overlaps with that. Best effort: errors are ignored.
 */
export async function warmScanService(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const base = serviceUrl(env.SCAN_API_URL);
  if (!scanEnabled(env) || !base) return;
  try {
    await fetch(`${base}/v1/health`, {
      headers: proxyHeaders(env),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    // Warming is optional.
  }
}
