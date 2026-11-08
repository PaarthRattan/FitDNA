import "server-only";
import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AiResult } from "./client";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export interface RunKey {
  task: string;
  model: string;
  promptVersion: string;
  /** The exact text sent. Only its hash is stored. */
  input: string;
}

export type RunOutcome =
  | { ok: true; output: unknown; cached: boolean }
  | { ok: false; error: string };

export const inputHash = (input: string) => createHash("sha256").update(input).digest("hex");

/**
 * Runs a model call at most once per (task, model, prompt version, input), and logs it
 * in `ai_runs`. A previous successful run is reused instead of calling again. Failed
 * runs are logged too, and retried next time.
 */
export async function runOnce(admin: Admin, key: RunKey, call: () => Promise<AiResult>): Promise<RunOutcome> {
  const hash = inputHash(key.input);
  const previous = await admin
    .from("ai_runs")
    .select("output")
    .eq("task", key.task)
    .eq("model", key.model)
    .eq("prompt_version", key.promptVersion)
    .eq("input_hash", hash)
    .eq("status", "ok")
    .maybeSingle();
  if (previous.data) return { ok: true, output: previous.data.output, cached: true };

  const result = await call();
  const logged = await admin.from("ai_runs").upsert(
    {
      task: key.task,
      model: result.model,
      prompt_version: key.promptVersion,
      input_hash: hash,
      status: result.ok ? "ok" : result.error === "empty" ? "invalid" : "error",
      output: result.ok ? JSON.parse(JSON.stringify(result.json)) : null,
      error: result.ok ? null : `${result.error}${result.detail ? `: ${result.detail}` : ""}`.slice(0, 500),
      input_tokens: result.usage?.inputTokens ?? null,
      cached_tokens: result.usage?.cachedTokens ?? null,
      output_tokens: result.usage?.outputTokens ?? null,
      latency_ms: result.latencyMs,
    },
    { onConflict: "task,model,prompt_version,input_hash" },
  );
  if (logged.error) console.error("AI run: couldn't log", key.task, logged.error.message);
  return result.ok ? { ok: true, output: result.json, cached: false } : { ok: false, error: result.error };
}
