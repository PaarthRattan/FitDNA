import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { as, createUser, freshDatabase } from "./db";

/*
 * Listings are shared marketplace data written only by the server (service role);
 * each user sees only listings they imported, plus demo ones. Overrides, saved
 * listings and purchases are owner-only. Runs as the `authenticated` and `anon`
 * roles with Supabase's default grants, so only row-level security protects rows.
 */

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

beforeEach(async () => {
  db = await freshDatabase();
  await createUser(db, ALICE);
  await createUser(db, BOB);
});

/** As the server: a superuser here, the secret-key client in the app. */
async function insertListing(url = "https://www.grailed.com/listings/1", isDemo = false): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into listings (marketplace, canonical_url, title, is_demo) values ('grailed', $1, 'Wool cardigan', $2) returning id",
    [url, isDemo],
  );
  return rows[0].id;
}

async function importFor(user: string, listingId: string) {
  await db.query("insert into listing_imports (user_id, listing_id, status) values ($1, $2, 'done')", [user, listingId]);
}

async function addChildren(listingId: string) {
  await db.query(
    "insert into listing_extractions (listing_id, source, fields, confidence, extractor_version) values ($1, 'seller', '{}', 1, 'regex-1')",
    [listingId],
  );
  await db.query("insert into price_observations (listing_id, price, currency) values ($1, 185, 'USD')", [listingId]);
}

const count = async (user: string | null, table: string) =>
  (await as(db, user, () => db.query(`select * from ${table}`))).rows.length;

describe("shared listing tables", () => {
  it("show a listing only to the users who imported it", async () => {
    const id = await insertListing();
    await addChildren(id);
    await importFor(ALICE, id);
    for (const table of ["listings", "listing_extractions", "price_observations"]) {
      expect(await count(ALICE, table)).toBe(1);
      expect(await count(BOB, table)).toBe(0);
      expect(await count(null, table)).toBe(0);
    }
  });

  it("show demo listings to everyone, signed in or not", async () => {
    const id = await insertListing("https://demo.fitdna.invalid/1", true);
    await addChildren(id);
    for (const user of [ALICE, BOB, null]) {
      expect(await count(user, "listings")).toBe(1);
      expect(await count(user, "listing_extractions")).toBe(1);
    }
  });

  it("can't be written by users", async () => {
    const id = await insertListing();
    await importFor(ALICE, id);
    for (const user of [ALICE, null]) {
      await expect(
        as(db, user, () => db.query("insert into listings (marketplace, canonical_url) values ('ebay', 'https://www.ebay.com/itm/123456789')")),
      ).rejects.toThrow(/row-level security/);
      await expect(
        as(db, user, () =>
          db.query(
            "insert into listing_extractions (listing_id, source, fields, confidence, extractor_version) values ($1, 'seller', '{}', 1, 'x')",
            [id],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        as(db, user, () => db.query("insert into price_observations (listing_id, price, currency) values ($1, 1, 'USD')", [id])),
      ).rejects.toThrow(/row-level security/);
      const update = await as(db, user, () => db.query("update listings set title = 'changed'"));
      const remove = await as(db, user, () => db.query("delete from listings"));
      expect(update.affectedRows).toBe(0);
      expect(remove.affectedRows).toBe(0);
    }
    const { rows } = await db.query("select title from listings");
    expect(rows).toEqual([{ title: "Wool cardigan" }]);
  });
});

describe("listing_imports", () => {
  it("are readable by their owner only", async () => {
    const id = await insertListing();
    await importFor(ALICE, id);
    expect(await count(ALICE, "listing_imports")).toBe(1);
    expect(await count(BOB, "listing_imports")).toBe(0);
  });

  it("can't be added, changed or removed by users (they're also the daily import count)", async () => {
    const id = await insertListing();
    await importFor(ALICE, id);
    await expect(
      as(db, ALICE, () => db.query("insert into listing_imports (user_id, listing_id) values ($1, $2)", [ALICE, id])),
    ).rejects.toThrow(/row-level security/);
    const update = await as(db, ALICE, () => db.query("update listing_imports set status = 'pending'"));
    const remove = await as(db, ALICE, () => db.query("delete from listing_imports"));
    expect(update.affectedRows).toBe(0);
    expect(remove.affectedRows).toBe(0);
  });

  it("need an error code exactly when they failed", async () => {
    const id = await insertListing();
    await expect(
      db.query("insert into listing_imports (user_id, listing_id, status) values ($1, $2, 'failed')", [ALICE, id]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query("insert into listing_imports (user_id, listing_id, status, error_code) values ($1, $2, 'done', 'blocked')", [ALICE, id]),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("user-owned listing tables", () => {
  const writes = {
    listing_overrides: (user: string, listing: string) =>
      db.query("insert into listing_overrides (user_id, listing_id, category) values ($1, $2, 'knit')", [user, listing]),
    saved_listings: (user: string, listing: string) =>
      db.query("insert into saved_listings (user_id, listing_id) values ($1, $2)", [user, listing]),
    purchases: (user: string, listing: string) =>
      db.query(
        `insert into purchases (user_id, listing_id, marketplace, category, prediction, engine_version, inputs_hash)
         values ($1, $2, 'grailed', 'knit', '{}', '1', 'h')`,
        [user, listing],
      ),
  };

  for (const [table, write] of Object.entries(writes)) {
    describe(table, () => {
      it("are owner-only", async () => {
        const id = await insertListing();
        await importFor(ALICE, id);
        await importFor(BOB, id);
        await as(db, ALICE, () => write(ALICE, id));
        expect(await count(ALICE, table)).toBe(1);
        expect(await count(BOB, table)).toBe(0);
        const remove = await as(db, BOB, () => db.query(`delete from ${table}`));
        expect(remove.affectedRows).toBe(0);
        await expect(as(db, BOB, () => write(ALICE, id))).rejects.toThrow(/row-level security/);
      });

      it("only for a listing the user can see", async () => {
        const id = await insertListing();
        await importFor(ALICE, id);
        await expect(as(db, BOB, () => write(BOB, id))).rejects.toThrow(/row-level security/);
      });
    });
  }

  it("can't move an override onto a listing the user can't see", async () => {
    const mine = await insertListing("https://www.grailed.com/listings/1");
    const theirs = await insertListing("https://www.grailed.com/listings/2");
    await importFor(ALICE, mine);
    await importFor(BOB, theirs);
    await as(db, ALICE, () => writes.listing_overrides(ALICE, mine));
    await expect(
      as(db, ALICE, () => db.query("update listing_overrides set listing_id = $1", [theirs])),
    ).rejects.toThrow(/row-level security/);
  });

  it("need a chest basis whenever a chest is given", async () => {
    const id = await insertListing();
    await expect(
      db.query("insert into listing_overrides (user_id, listing_id, chest_cm) values ($1, $2, 56)", [ALICE, id]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query("insert into listing_overrides (user_id, listing_id, cleared) values ($1, $2, '{waist}')", [ALICE, id]),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("deletion", () => {
  it("deleting a user removes their imports, overrides, saves and purchases, but not the shared listing", async () => {
    const id = await insertListing();
    await importFor(ALICE, id);
    await db.query("insert into listing_overrides (user_id, listing_id, category) values ($1, $2, 'knit')", [ALICE, id]);
    await db.query("insert into saved_listings (user_id, listing_id) values ($1, $2)", [ALICE, id]);
    await db.query(
      `insert into purchases (user_id, listing_id, marketplace, category, prediction, engine_version, inputs_hash)
       values ($1, $2, 'grailed', 'knit', '{}', '1', 'h')`,
      [ALICE, id],
    );
    await db.query("delete from auth.users where id = $1", [ALICE]);
    for (const table of ["listing_imports", "listing_overrides", "saved_listings", "purchases"]) {
      const { rows } = await db.query(`select * from ${table}`);
      expect(rows, table).toHaveLength(0);
    }
    expect((await db.query("select * from listings")).rows).toHaveLength(1);
  });

  it("deleting a listing (retention) keeps purchase snapshots but drops everything else", async () => {
    const id = await insertListing();
    await addChildren(id);
    await importFor(ALICE, id);
    await db.query("insert into saved_listings (user_id, listing_id) values ($1, $2)", [ALICE, id]);
    await db.query(
      `insert into purchases (user_id, listing_id, marketplace, category, prediction, engine_version, inputs_hash)
       values ($1, $2, 'grailed', 'knit', '{"overall":"ideal"}', '1', 'h')`,
      [ALICE, id],
    );
    await db.query("delete from listings where id = $1", [id]);
    for (const table of ["listing_imports", "listing_extractions", "price_observations", "saved_listings"]) {
      expect((await db.query(`select * from ${table}`)).rows, table).toHaveLength(0);
    }
    const { rows } = await db.query<{ listing_id: string | null; prediction: unknown }>("select listing_id, prediction from purchases");
    expect(rows).toEqual([{ listing_id: null, prediction: { overall: "ideal" } }]);
  });
});

describe("ai_runs", () => {
  it("is closed to every user: no reading, no writing", async () => {
    await db.query(
      "insert into ai_runs (task, model, prompt_version, input_hash, status, output) values ('listing_text', 'm', 'v1', $1, 'ok', '{}')",
      ["a".repeat(64)],
    );
    for (const user of [ALICE, null]) {
      expect(await count(user, "ai_runs")).toBe(0);
      await expect(
        as(db, user, () =>
          db.query("insert into ai_runs (task, model, prompt_version, input_hash, status) values ('t', 'm', 'v', $1, 'ok')", ["b".repeat(64)]),
        ),
      ).rejects.toThrow(/row-level security/);
      const remove = await as(db, user, () => db.query("delete from ai_runs"));
      expect(remove.affectedRows).toBe(0);
    }
  });

  it("logs one run per task, model, prompt version and input", async () => {
    const insert = () =>
      db.query("insert into ai_runs (task, model, prompt_version, input_hash, status) values ('t', 'm', 'v', $1, 'ok')", ["c".repeat(64)]);
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/);
  });
});

describe("seed.sql", () => {
  it("applies after the migrations, twice, and its demo listings are public", async () => {
    const seed = readFileSync(new URL("../seed.sql", import.meta.url), "utf8");
    await db.exec(seed);
    await db.exec(seed);
    expect(await count(null, "listings")).toBe(4);
    expect(await count(null, "listing_extractions")).toBe(4);
  });
});
