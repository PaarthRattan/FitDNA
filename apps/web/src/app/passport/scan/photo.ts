import {
  SCAN_MAX_IMAGE_BYTES,
  SCAN_PHOTO_JPEG_QUALITY,
  SCAN_PHOTO_LONG_SIDE_PX,
  SCAN_PHOTO_MIN_SHORT_SIDE_PX,
} from "@/lib/scan/constants";

/**
 * Prepares a photo in the browser before anything is sent: turned upright, shrunk so
 * the long side is at most 1280 px, and re-encoded as JPEG. Re-encoding drops all of
 * the original file's metadata (location, device, time), so none of it leaves the phone.
 */

export type PreparedPhoto =
  | { ok: true; blob: Blob; bitmap: ImageBitmap; width: number; height: number }
  | { ok: false; message: string };

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  let source: ImageBitmap;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, message: "That file couldn't be opened as a photo. Try taking it again." };
  }
  const scale = Math.min(1, SCAN_PHOTO_LONG_SIDE_PX / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  if (Math.min(width, height) < SCAN_PHOTO_MIN_SHORT_SIDE_PX) {
    source.close();
    return { ok: false, message: "That photo is too small. Use your phone's camera at its normal setting." };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    source.close();
    return { ok: false, message: "Your browser couldn't prepare the photo." };
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  source.close();

  let blob: Blob | null = null;
  for (const quality of [SCAN_PHOTO_JPEG_QUALITY, 0.7, 0.55]) {
    blob = await toBlob(canvas, quality);
    if (blob && blob.size <= SCAN_MAX_IMAGE_BYTES) break;
  }
  if (!blob || blob.size > SCAN_MAX_IMAGE_BYTES) return { ok: false, message: "That photo couldn't be made small enough to send." };
  const bitmap = await createImageBitmap(canvas);
  canvas.width = canvas.height = 0;
  return { ok: true, blob, bitmap, width, height };
}
