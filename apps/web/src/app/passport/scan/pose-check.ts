import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { checkPose, type PoseCheck, type View } from "@/lib/scan/pose";

/**
 * Runs MediaPipe Pose Landmarker on a prepared photo, in the browser, from files we host
 * (public/mediapipe/, put there by scripts/mediapipe-assets.mjs). The photo never leaves
 * the phone for this. Loaded on first use (about 15 MB, then cached by the browser).
 * If it can't load, the check is skipped and the scan service's own check stands.
 */

let landmarker: Promise<PoseLandmarker | null> | null = null;

function load(): Promise<PoseLandmarker | null> {
  landmarker ??= (async () => {
    try {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "CPU" },
        runningMode: "IMAGE",
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        outputSegmentationMasks: false,
      });
    } catch (error) {
      console.warn("Pose check unavailable", error instanceof Error ? error.message : error);
      return null;
    }
  })();
  return landmarker;
}

/** The check's verdict, or "unavailable" when the checker couldn't run here. */
export async function checkPhotoPose(bitmap: ImageBitmap, view: View): Promise<PoseCheck | "unavailable"> {
  const model = await load();
  if (!model) return "unavailable";
  try {
    const result = model.detect(bitmap);
    return checkPose({ landmarks: result.landmarks, worldLandmarks: result.worldLandmarks }, view);
  } catch {
    return "unavailable";
  }
}
