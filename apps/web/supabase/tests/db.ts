import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_DIR = fileURLToPath(new URL("..", import.meta.url));

/**
 * A fresh in-memory Postgres with the Supabase shim and every migration applied in
 * order, exactly as `supabase db reset` would apply them.
 */
export async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(`${SUPABASE_DIR}tests/supabase-shim.sql`, "utf8"));
  const migrations = readdirSync(`${SUPABASE_DIR}migrations`)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    await db.exec(readFileSync(`${SUPABASE_DIR}migrations/${file}`, "utf8"));
  }
  return db;
}

export async function createUser(db: PGlite, id: string, email = `${id}@example.test`) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

/**
 * Runs `fn` as an API request would: signed in as `userId` (role `authenticated`),
 * or anonymous when `userId` is null. Always restores the superuser afterwards.
 */
export async function as<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
