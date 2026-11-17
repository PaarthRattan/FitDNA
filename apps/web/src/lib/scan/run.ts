import "server-only";
import { createClientAsUser } from "@/lib/supabase/as-user";
import { postScan } from "./client";
import { AVATAR_BUCKET, avatarPath } from "./constants";
import type { ScanUpload } from "./parse";
import { validateScanResult } from "./result";
import type { ScanError } from "./status";

/**
 * Runs one scan after the request that started it has been answered (see `after()` in
 * src/app/api/scan/route.ts): sends the photos to the scan service, then stores what
 * came back. Every write is made as the user, so row-level security checks their scan
 * and data consents each time.
 *
 * The photos exist only in `upload`, in memory, for the length of this call. They're
 * never written anywhere or logged; logs carry the scan id and an error code only.
 */

type Client = NonNullable<ReturnType<typeof createClientAsUser>>;

async function fail(supabase: Client, scanId: string, error: ScanError, detail?: string) {
  console.error("Scan failed", { scanId, error, detail });
  const { error: dbError } = await supabase.from("scans").update({ status: "failed", error_code: error }).eq("id", scanId);
  if (dbError) console.error("Scan: couldn't record the failure", { scanId, message: dbError.message });
}

export async function runScan(job: { scanId: string; userId: string; accessToken: string; upload: ScanUpload }): Promise<void> {
  const supabase = createClientAsUser(job.accessToken);
  if (!supabase) return;
  const { scanId, userId } = job;
  try {
    const started = await supabase.from("scans").update({ status: "running" }).eq("id", scanId).select("id");
    if (started.error || started.data.length === 0) {
      // Withdrawn consent or a deleted scan: nothing may be sent or stored.
      console.error("Scan: not started", { scanId, message: started.error?.message ?? "no row" });
      return;
    }

    const call = await postScan(job.upload, scanId);
    if (!call.ok) return await fail(supabase, scanId, call.error, call.detail);
    const result = validateScanResult(call.json);
    if (!result) return await fail(supabase, scanId, "failed", "invalid result");

    // The avatar first, so a done scan never points at a missing file. If storing it
    // fails, the measurements are still worth keeping.
    const path = avatarPath(userId, scanId);
    const previous = await supabase.from("avatars").select("storage_path").eq("user_id", userId).maybeSingle();
    const uploaded = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, result.glb, { contentType: "model/gltf-binary", upsert: false, cacheControl: "no-store" });
    let avatarStored = false;
    if (uploaded.error) {
      console.error("Scan: couldn't store the avatar", { scanId, message: uploaded.error.message });
    } else {
      const saved = await supabase.from("avatars").upsert(
        {
          user_id: userId,
          scan_id: scanId,
          storage_path: path,
          glb_bytes: result.glb.byteLength,
          shape_layout: result.shape.layout,
          body_coeffs: result.shape.coeffs,
          body_scales: result.shape.scales,
          pipeline_version: result.pipelineVersion,
        },
        { onConflict: "user_id" },
      );
      if (saved.error) {
        console.error("Scan: couldn't record the avatar", { scanId, message: saved.error.message });
        await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      } else avatarStored = true;
    }

    const done = await supabase
      .from("scans")
      .update({ status: "done", error_code: null, result: JSON.parse(JSON.stringify(result.stored)), pipeline_version: result.pipelineVersion })
      .eq("id", scanId);
    if (done.error) return await fail(supabase, scanId, "failed", done.error.message);

    // The old avatar's file is replaced, not kept.
    const old = previous.data?.storage_path;
    if (avatarStored && old && old !== path) {
      const removed = await supabase.storage.from(AVATAR_BUCKET).remove([old]);
      if (removed.error) console.error("Scan: couldn't remove the previous avatar", { scanId, message: removed.error.message });
    }
  } catch (error) {
    await fail(supabase, scanId, "failed", error instanceof Error ? error.name : "unknown");
  }
}
