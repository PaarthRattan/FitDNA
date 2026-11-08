import "server-only";

/**
 * The AI model client: DeepSeek's OpenAI-compatible chat API, called with plain
 * `fetch` (no SDK). JSON output only, no tools, thinking off.
 *
 * What may be sent: listing text, and nothing else. Never body measurements, consent
 * records, user photos or anything that identifies a user. Every caller is in
 * src/lib/ai/tasks/ and prepares its input there.
 *
 * Off unless AI_ENABLED=true and DEEPSEEK_API_KEY is set, so CI and local
 * development never spend money by accident. Nothing here runs at import time.
 */

/** Model tiers. `text` is the cheap tier for reading listing text. */
export type AiTier = "text";

const DEFAULT_MODELS: Record<AiTier, string> = { text: "deepseek-flash" };

export function modelFor(tier: AiTier): string {
  return process.env.AI_MODEL_TEXT?.trim() || DEFAULT_MODELS[tier];
}

export function aiEnabled(): boolean {
  return process.env.AI_ENABLED === "true" && Boolean(process.env.DEEPSEEK_API_KEY);
}

/** DEEPSEEK_API_URL points at a local stub in tests; defaults to the hosted API. */
function endpoint(): string {
  const base = process.env.DEEPSEEK_API_URL?.trim() || "https://api.deepseek.com";
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

export const AI_TIMEOUT_MS = 20_000;

export type AiError = "disabled" | "timeout" | "busy" | "failed" | "empty";

export interface AiUsage {
  inputTokens: number | null;
  cachedTokens: number | null;
  outputTokens: number | null;
}

export type AiResult =
  | { ok: true; json: unknown; model: string; usage: AiUsage; latencyMs: number }
  | { ok: false; error: AiError; model: string; usage: AiUsage | null; latencyMs: number; detail?: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** What an API error status means for us. */
export function aiStatusError(status: number): AiError {
  if (status === 429 || status === 503) return "busy";
  return "failed";
}

/**
 * One JSON-mode completion. `system` must ask for JSON (the API requires the word).
 * The reply is parsed but not validated: validating it is the task's job.
 */
export async function chatJson({
  tier,
  system,
  user,
  maxTokens,
}: {
  tier: AiTier;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<AiResult> {
  const model = modelFor(tier);
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  if (!aiEnabled()) return { ok: false, error: "disabled", model, usage: null, latencyMs: 0 };

  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, error: timedOut ? "timeout" : "failed", model, usage: null, latencyMs: elapsed() };
  }

  if (!response.ok) {
    // 401 and 402 (bad key, no balance) need someone to act, so they're logged.
    if (response.status === 401 || response.status === 402) console.error("AI provider refused the request", response.status);
    return { ok: false, error: aiStatusError(response.status), model, usage: null, latencyMs: elapsed(), detail: `HTTP ${response.status}` };
  }

  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
    usage?: Record<string, unknown>;
  } | null;
  const usage: AiUsage = {
    inputTokens: num(body?.usage?.prompt_tokens),
    cachedTokens: num(body?.usage?.prompt_cache_hit_tokens),
    outputTokens: num(body?.usage?.completion_tokens),
  };
  const choice = body?.choices?.[0];
  const content = choice?.message?.content?.trim();
  // JSON mode can return blank content, or JSON cut off at max_tokens.
  if (!content || choice?.finish_reason === "length") {
    return { ok: false, error: "empty", model, usage, latencyMs: elapsed(), detail: choice?.finish_reason };
  }
  try {
    return { ok: true, json: JSON.parse(content), model, usage, latencyMs: elapsed() };
  } catch {
    return { ok: false, error: "empty", model, usage, latencyMs: elapsed(), detail: "not JSON" };
  }
}
