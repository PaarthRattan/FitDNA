import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `npm run eval`: model evals in evals/. They call the real AI provider and cost
 * money, so they're kept out of `npm test` and CI. Reads the AI settings from
 * .env.local.
 */

function aiEnvFromDotenv(): Record<string, string> {
  try {
    const lines = readFileSync(new URL("./.env.local", import.meta.url), "utf8").split("\n");
    return Object.fromEntries(
      lines
        .filter((l) => /^(AI_|DEEPSEEK_)[A-Z_]*=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    env: aiEnvFromDotenv(),
    testTimeout: 180_000,
  },
});
