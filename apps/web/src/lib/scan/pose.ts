/**
 * Checks a photo's pose on the phone, before it's sent, from MediaPipe Pose Landmarker
 * output. Pure, so it's unit-tested; the browser code that runs the model is in
 * src/app/passport/scan/pose-check.ts.
 *
 * The scan service makes the same checks (services/scan/app/pipeline.py) and has the
 * last word. These are a little more lenient, so a good photo is never refused here,
 * and they catch the common mistakes in a second instead of after a minute's upload
 * and processing, without the photo leaving the phone.
 */

export interface Point {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** One pose per detected person: normalised image landmarks and world landmarks (metres). */
export interface PoseResult {
  landmarks: Point[][];
  worldLandmarks: Point[][];
}

export type View = "front" | "side";

export type PoseProblem = "no_person" | "multiple_people" | "not_full_body" | "pose_front" | "pose_side";

export type PoseCheck = { ok: true } | { ok: false; problem: PoseProblem };

// MediaPipe's landmark indices. "Left" is the person's left.
const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_HIP = 23;
const R_HIP = 24;
const L_ANKLE = 27;
const R_ANKLE = 28;

/** The service's limits (pipeline.py) plus a margin. */
export const FRONT_MAX_TURN_DEG = 30; // service: 25
export const SIDE_MIN_TURN_DEG = 55; // service: 60
export const ARM_ABDUCTION_DEG: readonly [number, number] = [10, 60]; // service: 15–55
const MIN_VISIBILITY = 0.5;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const norm = (v: Point) => Math.hypot(v.x, v.y, v.z);
const deg = (rad: number) => (rad * 180) / Math.PI;

function angleDeg(a: Point, b: Point): number {
  const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (norm(a) * norm(b) || 1);
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

/** 0 when the shoulder line is square to the camera, 90 when it points at the camera. */
export function shoulderTurnDeg(world: Point[]): number {
  const s = sub(world[L_SHOULDER], world[R_SHOULDER]);
  return deg(Math.asin(Math.min(1, Math.abs(s.z) / (norm(s) || 1))));
}

/** How far an upper arm is raised from hanging straight down, in degrees. */
export function armAbductionDeg(world: Point[], side: "l" | "r"): number {
  const down = sub(mid(world[L_HIP], world[R_HIP]), mid(world[L_SHOULDER], world[R_SHOULDER]));
  const upper = side === "l" ? sub(world[L_ELBOW], world[L_SHOULDER]) : sub(world[R_ELBOW], world[R_SHOULDER]);
  return angleDeg(upper, down);
}

const inFrame = (p: Point | undefined) =>
  p !== undefined && (p.visibility ?? 1) >= MIN_VISIBILITY && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

export function checkPose(result: PoseResult, view: View): PoseCheck {
  if (result.landmarks.length === 0) return { ok: false, problem: "no_person" };
  if (result.landmarks.length > 1) return { ok: false, problem: "multiple_people" };
  const image = result.landmarks[0];
  const world = result.worldLandmarks[0];
  if (!world || world.length < 33 || image.length < 33) return { ok: false, problem: "no_person" };

  // Head to feet in the frame. From the side, the far ankle may be hidden behind the near one.
  const feet = view === "front" ? inFrame(image[L_ANKLE]) && inFrame(image[R_ANKLE]) : inFrame(image[L_ANKLE]) || inFrame(image[R_ANKLE]);
  if (!inFrame(image[NOSE]) || !feet) return { ok: false, problem: "not_full_body" };

  const turn = shoulderTurnDeg(world);
  if (view === "front") {
    if (turn > FRONT_MAX_TURN_DEG) return { ok: false, problem: "pose_front" };
    const [lo, hi] = ARM_ABDUCTION_DEG;
    for (const side of ["l", "r"] as const) {
      const a = armAbductionDeg(world, side);
      if (a < lo || a > hi) return { ok: false, problem: "pose_front" };
    }
    return { ok: true };
  }
  if (turn < SIDE_MIN_TURN_DEG) return { ok: false, problem: "pose_side" };
  // The right side faces the camera: the right shoulder is the nearer one (smaller z).
  if (world[R_SHOULDER].z >= world[L_SHOULDER].z) return { ok: false, problem: "pose_side" };
  return { ok: true };
}

export const POSE_MESSAGES: Record<PoseProblem, string> = {
  no_person: "We couldn't see a person in this photo.",
  multiple_people: "There's more than one person in this photo. Only you should be in it.",
  not_full_body: "Your whole body needs to be in the photo, from the top of your head to your feet.",
  pose_front: "Face the camera with your arms held a little away from your sides, like an A.",
  pose_side: "Turn so your right side faces the camera, and stand straight.",
};
