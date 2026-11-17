import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCapped } from "./body";
import { postScan, scanAllowedForUser, scanEnabled, scanRequestBody, serviceUrl, signScanRequest } from "./client";
import { SCAN_MAX_IMAGE_BYTES, SCAN_STALE_SECONDS } from "./constants";
import { effectiveRegion, scanAllowedInRegion } from "./geo";
import { parseScanUpload, type ScanUpload } from "./parse";
import { checkPose, type Point } from "./pose";
import { decodeGlb, readStoredResult, validateScanResult } from "./result";
import { scanState } from "./status";
import { statsEstimate } from "./stats";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const SECRET = "x".repeat(40);
const SCAN_ID = "11111111-2222-4333-8444-555555555555";

/** A minimal valid binary glTF: header plus an empty JSON chunk. */
function glb(): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode("{}  ");
  const out = new Uint8Array(12 + 8 + json.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  return out;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

function serviceReply(overrides: Record<string, unknown> = {}) {
  const m = (value_cm: number, extra = {}) => ({ value_cm, range_cm: 1.0, confidence: 90, disagreement_cm: 0.4, flags: ["unvalidated"], ...extra });
  return {
    pipeline_version: "sam3db:abc|mhr:1.0.1|refine:1|measure:1",
    measurements: { chest: m(101.23), shoulder: m(49.96), arm: m(61.04), waist: m(86), hip: m(99) },
    body_shape: { layout: "mhr-1.0.1/body20+scales", coeffs: Array(20).fill(0.1), scales: { scale_shoulder_width: 0.02 } },
    glb_base64: b64(glb()),
    flags: ["unvalidated"],
    ...overrides,
  };
}

function form(fields: Record<string, string>, files: Record<string, Uint8Array<ArrayBuffer>> = { front: JPEG, side: JPEG }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const [k, v] of Object.entries(files)) fd.set(k, new Blob([v]), `${k}.jpg`);
  return fd;
}

const env = (extra: Record<string, string> = {}) =>
  ({ SCAN_ENABLED: "true", SCAN_API_URL: "http://127.0.0.1:8787", SCAN_API_SECRET: SECRET, ...extra }) as unknown as NodeJS.ProcessEnv;

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Region gate
// ---------------------------------------------------------------------------

describe("scanAllowedInRegion", () => {
  it("fails closed on an unknown region, Illinois, and a US visitor whose state is unknown", () => {
    expect(scanAllowedInRegion(null)).toBe(false);
    expect(scanAllowedInRegion("US-IL")).toBe(false);
    expect(scanAllowedInRegion("US")).toBe(false);
  });

  it("allows other places", () => {
    for (const region of ["CA-QC", "CA-ON", "US-NY", "FR", "GB-ENG"]) expect(scanAllowedInRegion(region)).toBe(true);
  });

  it("lets SCAN_DEV_REGION stand in for missing headers in development only", () => {
    expect(effectiveRegion(null, { NODE_ENV: "development", SCAN_DEV_REGION: "ca-qc" })).toBe("CA-QC");
    expect(effectiveRegion(null, { NODE_ENV: "production", SCAN_DEV_REGION: "CA-QC" })).toBeNull();
    expect(effectiveRegion(null, { NODE_ENV: "test", SCAN_DEV_REGION: "CA-QC" })).toBeNull();
    expect(effectiveRegion(null, { NODE_ENV: "development", SCAN_DEV_REGION: "anywhere" })).toBeNull();
    // A real header always wins, so the override can't unblock Illinois.
    expect(effectiveRegion("US-IL", { NODE_ENV: "development", SCAN_DEV_REGION: "CA-QC" })).toBe("US-IL");
  });
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

describe("scanState", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();

  it("reads done, failed and working", () => {
    expect(scanState({ status: "done", error_code: null, updated_at: at(1) }, now)).toEqual({ state: "done" });
    expect(scanState({ status: "failed", error_code: "pose_side", updated_at: at(1) }, now)).toEqual({ state: "failed", error: "pose_side" });
    expect(scanState({ status: "failed", error_code: "nonsense", updated_at: at(1) }, now)).toEqual({ state: "failed", error: "failed" });
    expect(scanState({ status: "running", error_code: null, updated_at: at(10) }, now)).toEqual({ state: "working" });
  });

  it("turns a scan pending too long into a timeout", () => {
    expect(scanState({ status: "running", error_code: null, updated_at: at(SCAN_STALE_SECONDS + 1) }, now)).toEqual({
      state: "failed",
      error: "timeout",
    });
  });
});

// ---------------------------------------------------------------------------
// Upload parsing
// ---------------------------------------------------------------------------

describe("parseScanUpload", () => {
  it("accepts two photos and a height, with optional weight, age and sex", async () => {
    const parsed = await parseScanUpload(form({ height: "178,5", weight: "80", age: "30", sex: "male", adult: "yes" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toMatchObject({ heightCm: 178.5, weightKg: 80, age: 30, sex: "male" });
      expect(parsed.value.front.type).toBe("image/jpeg");
    }
  });

  it("converts inches and pounds", async () => {
    const parsed = await parseScanUpload(form({ unit: "in", height: "70", weight: "176", adult: "yes" }));
    expect(parsed.ok && parsed.value).toMatchObject({ heightCm: 177.8, weightKg: 79.8, age: null, sex: null });
  });

  it("needs the adult box, a plausible height and real photos", async () => {
    const parsed = await parseScanUpload(
      form({ height: "90", weight: "5", age: "16", sex: "other" }, { front: new Uint8Array([1, 2, 3, 4]) }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(Object.keys(parsed.errors).sort()).toEqual(["adult", "age", "front", "height", "sex", "side", "weight"]);
  });

  it("refuses an oversized photo without reading it as an image", async () => {
    const big = new Uint8Array(SCAN_MAX_IMAGE_BYTES + 1);
    big.set(JPEG);
    const parsed = await parseScanUpload(form({ height: "178", adult: "yes" }, { front: big, side: JPEG }));
    expect(!parsed.ok && parsed.errors.front).toMatch(/too large/);
  });
});

describe("readCapped", () => {
  const stream = (...chunks: number[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const n of chunks) c.enqueue(new Uint8Array(n));
        c.close();
      },
    });

  it("reads a body up to the cap and refuses one over it", async () => {
    expect((await readCapped(stream(10, 20), 30))?.length).toBe(30);
    expect(await readCapped(stream(10, 21), 30)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The service's reply
// ---------------------------------------------------------------------------

describe("validateScanResult", () => {
  it("keeps the engine's fields, caps confidence, floors the range and drops waist and hip", () => {
    const result = validateScanResult(serviceReply());
    expect(result).not.toBeNull();
    expect(result!.stored.measurements).toEqual({
      chest: { value_cm: 101.2, range_cm: 3, confidence: 45, disagreement_cm: 0.4, flags: ["unvalidated"] },
      shoulder: { value_cm: 50, range_cm: 1.5, confidence: 55, disagreement_cm: 0.4, flags: ["unvalidated"] },
      arm: { value_cm: 61, range_cm: 2, confidence: 55, disagreement_cm: 0.4, flags: ["unvalidated"] },
    });
    expect(result!.stored.flags).toEqual(["unvalidated"]);
    expect(result!.shape.coeffs).toHaveLength(20);
    expect(result!.glb.length).toBe(glb().length);
  });

  it("drops an implausible measurement but keeps the rest", () => {
    const reply = serviceReply();
    (reply.measurements as Record<string, unknown>).chest = { value_cm: 400, range_cm: 1, confidence: 50, flags: [] };
    expect(Object.keys(validateScanResult(reply)!.stored.measurements)).toEqual(["shoulder", "arm"]);
  });

  it("refuses a reply without a usable body shape or avatar", () => {
    expect(validateScanResult(serviceReply({ body_shape: { layout: "x", coeffs: Array(45).fill(0), scales: {} } }))).toBeNull();
    expect(validateScanResult(serviceReply({ body_shape: { layout: "x", coeffs: Array(20).fill(99), scales: {} } }))).toBeNull();
    expect(validateScanResult(serviceReply({ glb_base64: b64(new Uint8Array(40)) }))).toBeNull();
    expect(validateScanResult(serviceReply({ glb_base64: "not base64!" }))).toBeNull();
    expect(validateScanResult(serviceReply({ measurements: {} }))).toBeNull();
    expect(validateScanResult("nope")).toBeNull();
  });

  it("checks the GLB's own length field", () => {
    const bytes = glb();
    new DataView(bytes.buffer).setUint32(8, 999, true);
    expect(decodeGlb(b64(bytes))).toBeNull();
  });

  it("reads a stored result back with the same checks", () => {
    const stored = validateScanResult(serviceReply())!.stored;
    expect(readStoredResult(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(readStoredResult({ measurements: { chest: { value_cm: "96" } } })).toEqual({ measurements: {}, flags: [] });
  });
});

// ---------------------------------------------------------------------------
// The on-phone pose check
// ---------------------------------------------------------------------------

/** A standing person as MediaPipe would report them: turned `turnDeg` about the vertical, arms raised `armDeg`. */
function person(turnDeg: number, armDeg: number, opts: { feet?: boolean } = {}) {
  const t = (turnDeg * Math.PI) / 180;
  const a = (armDeg * Math.PI) / 180;
  const turn = (p: Point): Point => ({ x: p.x * Math.cos(t) + p.z * Math.sin(t), y: p.y, z: -p.x * Math.sin(t) + p.z * Math.cos(t) });
  const world: Point[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  const set = (i: number, x: number, y: number) => (world[i] = turn({ x, y, z: 0 }));
  set(11, 0.18, -0.5); // left shoulder (y down)
  set(12, -0.18, -0.5);
  set(13, 0.18 + Math.sin(a) * 0.3, -0.5 + Math.cos(a) * 0.3); // left elbow
  set(14, -0.18 - Math.sin(a) * 0.3, -0.5 + Math.cos(a) * 0.3);
  set(23, 0.1, 0);
  set(24, -0.1, 0);
  const image: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  image[0] = { x: 0.5, y: 0.1, z: 0, visibility: 0.99 };
  image[27] = { x: 0.45, y: opts.feet === false ? 1.05 : 0.95, z: 0, visibility: 0.9 };
  image[28] = { x: 0.55, y: opts.feet === false ? 1.05 : 0.95, z: 0, visibility: 0.9 };
  return { image, world };
}

const result = (...people: Array<{ image: Point[]; world: Point[] }>) => ({
  landmarks: people.map((p) => p.image),
  worldLandmarks: people.map((p) => p.world),
});

describe("checkPose", () => {
  it("passes a square-on A-pose from the front", () => {
    expect(checkPose(result(person(0, 30)), "front")).toEqual({ ok: true });
  });

  it("catches arms down, a turned body, missing feet, nobody and two people", () => {
    expect(checkPose(result(person(0, 3)), "front")).toEqual({ ok: false, problem: "pose_front" });
    expect(checkPose(result(person(40, 30)), "front")).toEqual({ ok: false, problem: "pose_front" });
    expect(checkPose(result(person(0, 30, { feet: false })), "front")).toEqual({ ok: false, problem: "not_full_body" });
    expect(checkPose(result(), "front")).toEqual({ ok: false, problem: "no_person" });
    expect(checkPose(result(person(0, 30), person(0, 30)), "front")).toEqual({ ok: false, problem: "multiple_people" });
  });

  it("wants the right side to the camera for the side photo", () => {
    // Turning -90° brings the right shoulder nearer the camera (smaller z).
    expect(checkPose(result(person(-90, 5)), "side")).toEqual({ ok: true });
    expect(checkPose(result(person(90, 5)), "side")).toEqual({ ok: false, problem: "pose_side" });
    expect(checkPose(result(person(-30, 5)), "side")).toEqual({ ok: false, problem: "pose_side" });
  });
});

// ---------------------------------------------------------------------------
// The service client
// ---------------------------------------------------------------------------

describe("scan client settings", () => {
  it("is off unless switched on with a URL and a long enough secret", () => {
    expect(scanEnabled(env())).toBe(true);
    expect(scanEnabled(env({ SCAN_ENABLED: "1" }))).toBe(false);
    expect(scanEnabled(env({ SCAN_API_SECRET: "short" }))).toBe(false);
    expect(scanEnabled(env({ SCAN_API_URL: "http://scan.example.com" }))).toBe(false);
  });

  it("accepts https, or http only to this machine", () => {
    expect(serviceUrl("https://fitdna--scan.modal.run/")).toBe("https://fitdna--scan.modal.run");
    expect(serviceUrl("http://localhost:8787")).toBe("http://localhost:8787");
    expect(serviceUrl("http://10.0.0.5:8787")).toBeNull();
    expect(serviceUrl("https://user:pw@scan.example.com")).toBeNull();
    expect(serviceUrl("ftp://scan.example.com")).toBeNull();
  });

  it("limits scanning to the allow-list when there is one", () => {
    expect(scanAllowedForUser("abc", env())).toBe(true);
    expect(scanAllowedForUser("ABC", env({ SCAN_ALLOWLIST_USER_IDS: " abc , def" }))).toBe(true);
    expect(scanAllowedForUser("xyz", env({ SCAN_ALLOWLIST_USER_IDS: "abc,def" }))).toBe(false);
  });

  it("signs exactly as the service checks (services/scan/tests: same vector)", () => {
    expect(signScanRequest("s3cret", 1762870000, SCAN_ID, "a".repeat(64))).toBe(
      "0710228f1d0b461cf0115b921f8577da4bcb84b387f54abe73cb751ff817ab59",
    );
  });
});

describe("postScan", () => {
  const upload: ScanUpload = {
    front: { bytes: new Uint8Array(JPEG), type: "image/jpeg" },
    side: { bytes: new Uint8Array(JPEG), type: "image/jpeg" },
    heightCm: 178,
    weightKg: null,
    age: 30,
    sex: null,
  };

  it("sends a signed multipart body and returns the reply", async () => {
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json(serviceReply()));
    vi.stubGlobal("fetch", fetchSpy);
    const call = await postScan(upload, SCAN_ID, { env: env({ SCAN_PROXY_TOKEN_ID: "wk-1", SCAN_PROXY_TOKEN_SECRET: "ws-1" }), now: () => 1_762_870_000_000 });
    expect(call.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8787/v1/scan");
    expect(init.redirect).toBe("manual");
    const headers = init.headers as Record<string, string>;
    const body = init.body as Uint8Array<ArrayBuffer>;
    const digest = createHash("sha256").update(body).digest("hex");
    expect(headers["X-FitDNA-Content-SHA256"]).toBe(digest);
    expect(headers["X-FitDNA-Timestamp"]).toBe("1762870000");
    expect(headers["X-FitDNA-Signature"]).toBe(createHmac("sha256", SECRET).update(`1762870000\n${SCAN_ID}\n${digest}`).digest("hex"));
    expect(headers["Modal-Key"]).toBe("wk-1");

    // The body is the multipart form the service parses: both photos and only the fields given.
    const sent = await new Response(body, { headers: { "content-type": headers["Content-Type"] } }).formData();
    expect([...sent.keys()].sort()).toEqual(["age", "front", "height_cm", "side"]);
    expect(sent.get("height_cm")).toBe("178");
  });

  it("maps the service's errors, redirects and timeouts", async () => {
    const cases: Array<[Response | Error, string]> = [
      [Response.json({ error: "pose_side" }, { status: 422 }), "pose_side"],
      [Response.json({ error: "unauthorized" }, { status: 401 }), "failed"],
      [new Response("", { status: 503 }), "busy"],
      [new Response("", { status: 504 }), "timeout"],
      [new Response(null, { status: 303, headers: { location: "https://elsewhere.example" } }), "timeout"],
      [Object.assign(new Error("slow"), { name: "TimeoutError" }), "timeout"],
    ];
    for (const [answer, expected] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => (answer instanceof Error ? Promise.reject(answer) : answer)));
      const call = await postScan(upload, SCAN_ID, { env: env() });
      expect(call.ok ? "ok" : call.error, expected).toBe(expected);
    }
  });

  it("never calls out when scanning is off", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await postScan(upload, SCAN_ID, { env: env({ SCAN_ENABLED: "false" }) })).toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("builds a body under the service's limit for two full-size photos", async () => {
    const photo = { bytes: new Uint8Array(SCAN_MAX_IMAGE_BYTES), type: "image/jpeg" as const };
    const { body } = await scanRequestBody({ ...upload, front: photo, side: photo });
    expect(body.byteLength).toBeLessThan(1_900_000);
  });
});

// ---------------------------------------------------------------------------
// The statistics model
// ---------------------------------------------------------------------------

describe("statsEstimate", () => {
  it("uses the same coefficients as the scan service", () => {
    const service = readFileSync(new URL("../../../../../services/scan/app/stats/coefficients.json", import.meta.url), "utf8");
    const copy = readFileSync(new URL("./stats-coefficients.json", import.meta.url), "utf8");
    expect(JSON.parse(copy)).toEqual(JSON.parse(service));
  });

  // From services/scan: `predict(...)` for the same inputs.
  const cases = [
    { input: { heightCm: 178, weightKg: 80, age: 30, sex: "male" as const }, expected: { chest: 101.9, shoulder: 50.0, arm: 60.2 } },
    { input: { heightCm: 165, weightKg: 60, sex: "female" as const }, expected: { chest: 88.3, shoulder: 45.8, arm: 54.9 } },
    { input: { heightCm: 172, age: 45 }, expected: { chest: 107.9, shoulder: 49.1, arm: 57.9 } },
    { input: { heightCm: 190, sex: "male" as const }, expected: { chest: 110.4, shoulder: 52.0, arm: 64.5 } },
    { input: { heightCm: 158, weightKg: 52, age: 22, sex: "female" as const }, expected: { chest: 84.3, shoulder: 44.8, arm: 52.4 } },
  ];

  it.each(cases)("agrees with the Python model for %o", ({ input, expected }) => {
    const out = statsEstimate(input);
    for (const field of ["chest", "shoulder", "arm"] as const) expect(out[field].valueCm).toBeCloseTo(expected[field], 1);
  });
});
