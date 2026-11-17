// Puts the files the scan page's on-phone pose check needs into public/mediapipe/, so
// they're served by us and a phone never contacts Google's CDN:
// - MediaPipe's WebAssembly runtime, copied from node_modules (@mediapipe/tasks-vision);
// - the pose model, downloaded once from a pinned URL and checked against its SHA-256.
// Runs before `next dev` and `next build`. Fails soft: without these files the page
// skips the on-phone check, and the scan service still checks every photo.
// public/mediapipe/ is gitignored.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${ROOT}public/mediapipe/`;
const WASM_FROM = `${ROOT}node_modules/@mediapipe/tasks-vision/wasm/`;
const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];
const MODEL = {
  name: "pose_landmarker_lite.task",
  url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  await mkdir(`${OUT}wasm`, { recursive: true });
  for (const file of WASM_FILES) await copyFile(`${WASM_FROM}${file}`, `${OUT}wasm/${file}`);

  const target = `${OUT}${MODEL.name}`;
  const existing = await readFile(target).catch(() => null);
  if (existing && sha256(existing) === MODEL.sha256) return;
  const response = await fetch(MODEL.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`model download: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== MODEL.sha256) throw new Error("model download: checksum mismatch");
  await writeFile(target, bytes);
}

main().catch((error) => {
  console.warn(`[mediapipe-assets] skipped (the scan page will rely on the server's photo checks): ${error.message}`);
});
