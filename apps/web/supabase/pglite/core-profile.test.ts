import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { as, createUser, freshDatabase } from "./db";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

beforeEach(async () => {
  db = await freshDatabase();
  await createUser(db, ALICE);
  await createUser(db, BOB);
});

const insertGarment = (owner: string, title = "zip-up") =>
  db.query(
    `insert into reference_garments (user_id, title, category, chest_cm, chest_basis, fit_zone)
     values ($1, $2, 'knit', 56, 'flat', 'ideal') returning id`,
    [owner, title],
  );

const grant = (owner: string, scope = "data") =>
  db.query("insert into consents (user_id, scope, action, policy_version) values ($1, $2, 'granted', 'v1')", [owner, scope]);

const withdraw = (owner: string, scope = "data") =>
  db.query("insert into consents (user_id, scope, action, policy_version) values ($1, $2, 'withdrawn', 'v1')", [owner, scope]);

const insertMeasurement = (owner: string, name = "chest", value = 96) =>
  db.query(
    "insert into body_measurements (user_id, name, value_cm, confidence, source) values ($1, $2, $3, 60, 'manual')",
    [owner, name, value],
  );

describe("migrations", () => {
  it("apply cleanly to an empty database", async () => {
    const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(rows).toEqual(
      [
        "ai_runs",
        "body_measurements",
        "consents",
        "fit_preferences",
        "listing_extractions",
        "listing_imports",
        "listing_overrides",
        "listings",
        "price_observations",
        "purchases",
        "reference_garments",
        "saved_listings",
        "size_charts",
      ].map((tablename) => ({ tablename, rowsecurity: true })),
    );
  });
});

describe("owner-only access (reference_garments)", () => {
  it("lets a user write and read their own rows", async () => {
    await as(db, ALICE, () => insertGarment(ALICE));
    const { rows } = await as(db, ALICE, () => db.query("select title from reference_garments"));
    expect(rows).toEqual([{ title: "zip-up" }]);
  });

  it("hides one user's rows from another", async () => {
    await as(db, ALICE, () => insertGarment(ALICE));
    const { rows } = await as(db, BOB, () => db.query("select * from reference_garments"));
    expect(rows).toHaveLength(0);
  });

  it("stops a user editing or deleting someone else's rows", async () => {
    await as(db, ALICE, () => insertGarment(ALICE));
    const update = await as(db, BOB, () => db.query("update reference_garments set title = 'mine now'"));
    const remove = await as(db, BOB, () => db.query("delete from reference_garments"));
    expect(update.affectedRows).toBe(0);
    expect(remove.affectedRows).toBe(0);
    const { rows } = await db.query("select title from reference_garments");
    expect(rows).toEqual([{ title: "zip-up" }]);
  });

  it("stops a user writing a row owned by someone else", async () => {
    await expect(as(db, BOB, () => insertGarment(ALICE))).rejects.toThrow(/row-level security/);
  });

  it("stops a user moving their row to someone else", async () => {
    await as(db, ALICE, () => insertGarment(ALICE));
    await expect(as(db, ALICE, () => db.query("update reference_garments set user_id = $1", [BOB]))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("shows anonymous requests nothing and lets them write nothing", async () => {
    await as(db, ALICE, () => insertGarment(ALICE));
    const { rows } = await as(db, null, () => db.query("select * from reference_garments"));
    expect(rows).toHaveLength(0);
    await expect(as(db, null, () => insertGarment(ALICE))).rejects.toThrow(/row-level security/);
  });

  it("keeps fit preferences private the same way", async () => {
    await as(db, ALICE, () =>
      db.query("insert into fit_preferences (user_id, category, text) values ($1, 'knit', 'relaxed body')", [ALICE]),
    );
    const { rows } = await as(db, BOB, () => db.query("select * from fit_preferences"));
    expect(rows).toHaveLength(0);
  });
});

describe("consent gate on body measurements", () => {
  it("refuses body data before consent", async () => {
    await expect(as(db, ALICE, () => insertMeasurement(ALICE))).rejects.toThrow(/row-level security/);
  });

  it("accepts body data once consent is granted", async () => {
    await as(db, ALICE, () => grant(ALICE));
    await as(db, ALICE, () => insertMeasurement(ALICE));
    const { rows } = await as(db, ALICE, () => db.query("select name, value_cm from body_measurements"));
    expect(rows).toEqual([{ name: "chest", value_cm: "96.0" }]);
  });

  it("refuses new body data after withdrawal, but still allows deleting it", async () => {
    await as(db, ALICE, async () => {
      await grant(ALICE);
      await insertMeasurement(ALICE);
      await withdraw(ALICE);
    });
    await expect(as(db, ALICE, () => insertMeasurement(ALICE, "arm", 63))).rejects.toThrow(/row-level security/);
    const update = as(db, ALICE, () => db.query("update body_measurements set value_cm = 97"));
    await expect(update).rejects.toThrow(/row-level security/);
    const removed = await as(db, ALICE, () => db.query("delete from body_measurements"));
    expect(removed.affectedRows).toBe(1);
  });

  it("uses the latest consent row, even when written in the same transaction", async () => {
    await as(db, ALICE, async () => {
      await db.exec("begin");
      await withdraw(ALICE);
      await grant(ALICE);
      await db.exec("commit");
    });
    const { rows } = await as(db, ALICE, () => db.query("select public.has_current_consent('data') as ok"));
    expect(rows).toEqual([{ ok: true }]);
  });

  it("doesn't count another user's consent", async () => {
    await as(db, BOB, () => grant(BOB));
    await expect(as(db, ALICE, () => insertMeasurement(ALICE))).rejects.toThrow(/row-level security/);
  });

  it("keeps scan consent separate from data consent", async () => {
    await as(db, ALICE, () => grant(ALICE, "scan"));
    await expect(as(db, ALICE, () => insertMeasurement(ALICE))).rejects.toThrow(/row-level security/);
  });

  it("keeps one value per measurement per user", async () => {
    await as(db, ALICE, () => grant(ALICE));
    await as(db, ALICE, () => insertMeasurement(ALICE));
    await expect(as(db, ALICE, () => insertMeasurement(ALICE, "chest", 98))).rejects.toThrow(/duplicate key/);
  });
});

describe("upserts, which is how the app saves", () => {
  const upsert = (owner: string, value: number) =>
    db.query(
      `insert into body_measurements (user_id, name, value_cm, confidence, source)
       values ($1, 'chest', $2, 60, 'manual')
       on conflict (user_id, name) do update set value_cm = excluded.value_cm`,
      [owner, value],
    );

  it("updates an existing measurement in place when consent is current", async () => {
    await as(db, ALICE, async () => {
      await grant(ALICE);
      await upsert(ALICE, 96);
      await upsert(ALICE, 97.5);
    });
    const { rows } = await db.query("select value_cm from body_measurements");
    expect(rows).toEqual([{ value_cm: "97.5" }]);
  });

  it("refuses the update after consent is withdrawn", async () => {
    await as(db, ALICE, async () => {
      await grant(ALICE);
      await upsert(ALICE, 96);
      await withdraw(ALICE);
    });
    await expect(as(db, ALICE, () => upsert(ALICE, 97))).rejects.toThrow(/row-level security/);
  });

  it("can't overwrite another user's row through the conflict", async () => {
    await as(db, ALICE, async () => {
      await grant(ALICE);
      await upsert(ALICE, 96);
    });
    await as(db, BOB, () => grant(BOB));
    await expect(as(db, BOB, () => upsert(ALICE, 50))).rejects.toThrow(/row-level security/);
    const { rows } = await db.query("select value_cm from body_measurements");
    expect(rows).toEqual([{ value_cm: "96.0" }]);
  });

  it("upserts fit preferences per category", async () => {
    const save = (text: string) =>
      db.query(
        `insert into fit_preferences (user_id, category, text) values ($1, 'knit', $2)
         on conflict (user_id, category) do update set text = excluded.text`,
        [ALICE, text],
      );
    await as(db, ALICE, async () => {
      await save("relaxed");
      await save("relaxed body, short sleeves");
    });
    const { rows } = await db.query("select text from fit_preferences");
    expect(rows).toEqual([{ text: "relaxed body, short sleeves" }]);
  });
});

describe("consents are append-only", () => {
  it("can't be edited or deleted by their owner", async () => {
    await as(db, ALICE, () => grant(ALICE));
    const update = await as(db, ALICE, () => db.query("update consents set action = 'withdrawn'"));
    const remove = await as(db, ALICE, () => db.query("delete from consents"));
    expect(update.affectedRows).toBe(0);
    expect(remove.affectedRows).toBe(0);
    const { rows } = await db.query("select action from consents");
    expect(rows).toEqual([{ action: "granted" }]);
  });

  it("can't be read by anyone else", async () => {
    await as(db, ALICE, () => grant(ALICE));
    const { rows } = await as(db, BOB, () => db.query("select * from consents"));
    expect(rows).toHaveLength(0);
  });
});

describe("delete my data", () => {
  it("removes every row when the auth user is deleted", async () => {
    await as(db, ALICE, async () => {
      await grant(ALICE);
      await insertMeasurement(ALICE);
      await insertGarment(ALICE);
      await db.query("insert into fit_preferences (user_id, category, text) values ($1, 'tee', 'fitted')", [ALICE]);
    });
    await as(db, BOB, () => insertGarment(BOB, "bob's tee"));

    await db.query("delete from auth.users where id = $1", [ALICE]);

    for (const table of ["consents", "body_measurements", "reference_garments", "fit_preferences"]) {
      const { rows } = await db.query(`select count(*)::int as n from ${table} where user_id = $1`, [ALICE]);
      expect(rows, table).toEqual([{ n: 0 }]);
    }
    const { rows } = await db.query("select title from reference_garments");
    expect(rows).toEqual([{ title: "bob's tee" }]);
  });
});

describe("constraints", () => {
  it("rejects values outside the allowed sets and ranges", async () => {
    await as(db, ALICE, () => grant(ALICE));
    await expect(as(db, ALICE, () => insertMeasurement(ALICE, "chest", 0))).rejects.toThrow(/check constraint/);
    await expect(as(db, ALICE, () => insertMeasurement(ALICE, "neck", 40))).rejects.toThrow(/check constraint/);
    await expect(
      as(db, ALICE, () =>
        db.query(
          "insert into reference_garments (user_id, title, category, chest_basis, fit_zone) values ($1, 'x', 'knit', 'diagonal', 'ideal')",
          [ALICE],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("stamps updated_at on edit", async () => {
    await as(db, ALICE, () => insertGarment(ALICE));
    await db.exec("update reference_garments set updated_at = now() - interval '1 day'");
    const before = await db.query<{ updated_at: Date }>("select updated_at from reference_garments");
    await as(db, ALICE, () => db.query("update reference_garments set title = 'renamed'"));
    const after = await db.query<{ updated_at: Date }>("select updated_at from reference_garments");
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });
});
