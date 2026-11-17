import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { as, createUser, freshDatabase } from "./db";

/**
 * Scans and avatars: owner-only, and every write needs both a current scan consent and
 * a current data consent. Deleting never needs consent. The avatars bucket is private,
 * one folder per user.
 */

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const COEFFS = `{${Array.from({ length: 20 }, () => "0.1").join(",")}}`;

let db: PGlite;

beforeEach(async () => {
  db = await freshDatabase();
  await createUser(db, ALICE);
  await createUser(db, BOB);
});

const consent = (owner: string, scope: "data" | "scan", action: "granted" | "withdrawn" = "granted") =>
  db.query("insert into consents (user_id, scope, action, policy_version) values ($1, $2, $3, 'v1')", [owner, scope, action]);

async function consentBoth(owner: string) {
  await consent(owner, "data");
  await consent(owner, "scan");
}

const insertScan = (owner: string, extra = "") =>
  db.query<{ id: string }>(
    `insert into scans (user_id, adult_attested, height_cm${extra ? ", status, result" : ""})
     values ($1, true, 178${extra}) returning id`,
    [owner],
  );

const insertAvatar = (owner: string, scanId: string, path = `${owner}/${scanId}.glb`) =>
  db.query(
    `insert into avatars (user_id, scan_id, storage_path, glb_bytes, shape_layout, body_coeffs, body_scales, pipeline_version)
     values ($1, $2, $3, 1000, 'mhr-1.0.1/body20+scales', $4, '{}', 'test')`,
    [owner, scanId, path, COEFFS],
  );

const upload = (name: string) =>
  db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [name]);

describe("scans", () => {
  it("lets a consenting user create and read their own scans, and hides them from others", async () => {
    await consentBoth(ALICE);
    await as(db, ALICE, () => insertScan(ALICE));
    expect((await as(db, ALICE, () => db.query("select height_cm from scans"))).rows).toEqual([{ height_cm: "178.0" }]);
    expect((await as(db, BOB, () => db.query("select * from scans"))).rows).toHaveLength(0);
    expect((await as(db, null, () => db.query("select * from scans"))).rows).toHaveLength(0);
  });

  it("refuses a scan without a scan consent, with only one of the two, and after withdrawal", async () => {
    await expect(as(db, ALICE, () => insertScan(ALICE))).rejects.toThrow(/row-level security/);
    await consent(ALICE, "data");
    await expect(as(db, ALICE, () => insertScan(ALICE))).rejects.toThrow(/row-level security/);
    await consent(BOB, "scan");
    await expect(as(db, BOB, () => insertScan(BOB))).rejects.toThrow(/row-level security/);
    await consent(ALICE, "scan");
    await as(db, ALICE, () => insertScan(ALICE));
    await consent(ALICE, "scan", "withdrawn");
    await expect(as(db, ALICE, () => insertScan(ALICE))).rejects.toThrow(/row-level security/);
  });

  it("stops updates after withdrawal, but always allows deleting", async () => {
    await consentBoth(ALICE);
    const id = (await as(db, ALICE, () => insertScan(ALICE))).rows[0].id;
    await consent(ALICE, "data", "withdrawn");
    await expect(as(db, ALICE, () => db.query("update scans set status = 'running' where id = $1", [id]))).rejects.toThrow(
      /row-level security/,
    );
    const removed = await as(db, ALICE, () => db.query("delete from scans where id = $1", [id]));
    expect(removed.affectedRows).toBe(1);
  });

  it("won't let a user create a scan for someone else, or touch theirs", async () => {
    await consentBoth(ALICE);
    await consentBoth(BOB);
    await expect(as(db, BOB, () => insertScan(ALICE))).rejects.toThrow(/row-level security/);
    await as(db, ALICE, () => insertScan(ALICE));
    const update = await as(db, BOB, () => db.query("update scans set status = 'running'"));
    const remove = await as(db, BOB, () => db.query("delete from scans"));
    expect(update.affectedRows).toBe(0);
    expect(remove.affectedRows).toBe(0);
  });

  it("checks its constraints", async () => {
    await consentBoth(ALICE);
    await as(db, ALICE, async () => {
      // Adults only, plausible heights, a failure always has a reason, a result only when done.
      await expect(
        db.query("insert into scans (user_id, adult_attested, height_cm) values ($1, false, 178)", [ALICE]),
      ).rejects.toThrow(/check/);
      await expect(db.query("insert into scans (user_id, adult_attested, height_cm) values ($1, true, 90)", [ALICE])).rejects.toThrow(
        /check/,
      );
      await expect(
        db.query("insert into scans (user_id, adult_attested, height_cm, status) values ($1, true, 178, 'failed')", [ALICE]),
      ).rejects.toThrow(/check/);
      await expect(
        db.query("insert into scans (user_id, adult_attested, height_cm, error_code) values ($1, true, 178, 'no_person')", [ALICE]),
      ).rejects.toThrow(/check/);
      await expect(
        db.query("insert into scans (user_id, adult_attested, height_cm, result) values ($1, true, 178, '{}')", [ALICE]),
      ).rejects.toThrow(/check/);
      await expect(
        db.query(
          "insert into scans (user_id, adult_attested, height_cm, status, error_code) values ($1, true, 178, 'failed', 'made_up')",
          [ALICE],
        ),
      ).rejects.toThrow(/check/);
      await db.query(
        "insert into scans (user_id, adult_attested, height_cm, status, error_code) values ($1, true, 178, 'failed', 'pose_side')",
        [ALICE],
      );
    });
  });
});

describe("avatars", () => {
  it("stores one avatar per user, owner-only, pointing at the owner's own scan", async () => {
    await consentBoth(ALICE);
    await consentBoth(BOB);
    const scan = (await as(db, ALICE, () => insertScan(ALICE, ", 'done', '{}'"))).rows[0].id;
    await as(db, ALICE, () => insertAvatar(ALICE, scan));
    expect((await as(db, ALICE, () => db.query("select storage_path from avatars"))).rows).toEqual([
      { storage_path: `${ALICE}/${scan}.glb` },
    ]);
    expect((await as(db, BOB, () => db.query("select * from avatars"))).rows).toHaveLength(0);
    // Bob can't hang his avatar on Alice's scan, even though foreign keys ignore RLS.
    await expect(as(db, BOB, () => insertAvatar(BOB, scan, `${BOB}/${scan}.glb`))).rejects.toThrow(/foreign key/);
  });

  it("keeps the object path, the shape size and the consent rules", async () => {
    await consentBoth(ALICE);
    const scan = (await as(db, ALICE, () => insertScan(ALICE, ", 'done', '{}'"))).rows[0].id;
    await expect(as(db, ALICE, () => insertAvatar(ALICE, scan, `${ALICE}/elsewhere.glb`))).rejects.toThrow(/check/);
    await expect(
      as(db, ALICE, () =>
        db.query(
          `insert into avatars (user_id, scan_id, storage_path, glb_bytes, shape_layout, body_coeffs, body_scales, pipeline_version)
           values ($1, $2, $3, 1000, 'x', '{1,2,3}', '{}', 't')`,
          [ALICE, scan, `${ALICE}/${scan}.glb`],
        ),
      ),
    ).rejects.toThrow(/check/);
    await consent(ALICE, "scan", "withdrawn");
    await expect(as(db, ALICE, () => insertAvatar(ALICE, scan))).rejects.toThrow(/row-level security/);
  });

  it("goes when its scan or its user goes", async () => {
    await consentBoth(ALICE);
    const scan = (await as(db, ALICE, () => insertScan(ALICE, ", 'done', '{}'"))).rows[0].id;
    await as(db, ALICE, () => insertAvatar(ALICE, scan));
    await as(db, ALICE, () => db.query("delete from scans where id = $1", [scan]));
    expect((await db.query("select * from avatars")).rows).toHaveLength(0);

    const again = (await as(db, ALICE, () => insertScan(ALICE, ", 'done', '{}'"))).rows[0].id;
    await as(db, ALICE, () => insertAvatar(ALICE, again));
    await db.query("delete from auth.users where id = $1", [ALICE]);
    expect((await db.query("select * from avatars")).rows).toHaveLength(0);
    expect((await db.query("select * from scans")).rows).toHaveLength(0);
  });
});

describe("avatars bucket", () => {
  it("exists, private, GLB only, 2 MB", async () => {
    const { rows } = await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'");
    expect(rows).toEqual([{ public: false, file_size_limit: 2097152, allowed_mime_types: ["model/gltf-binary"] }]);
  });

  it("lets a consenting user upload only into their own folder, and read only their own", async () => {
    await consentBoth(ALICE);
    await as(db, ALICE, () => upload(`${ALICE}/scan.glb`));
    await expect(as(db, ALICE, () => upload(`${BOB}/scan.glb`))).rejects.toThrow(/row-level security/);
    await expect(as(db, ALICE, () => upload("scan.glb"))).rejects.toThrow(/row-level security/);
    expect((await as(db, ALICE, () => db.query("select name from storage.objects"))).rows).toEqual([{ name: `${ALICE}/scan.glb` }]);
    expect((await as(db, BOB, () => db.query("select * from storage.objects"))).rows).toHaveLength(0);
    expect((await as(db, null, () => db.query("select * from storage.objects"))).rows).toHaveLength(0);
  });

  it("refuses uploads without both consents, but lets the owner delete", async () => {
    await consent(ALICE, "data");
    await expect(as(db, ALICE, () => upload(`${ALICE}/scan.glb`))).rejects.toThrow(/row-level security/);
    await consent(ALICE, "scan");
    await as(db, ALICE, () => upload(`${ALICE}/scan.glb`));
    await consent(ALICE, "scan", "withdrawn");
    expect((await as(db, BOB, () => db.query("delete from storage.objects"))).affectedRows).toBe(0);
    expect((await as(db, ALICE, () => db.query("delete from storage.objects"))).affectedRows).toBe(1);
  });
});

describe("retention (purge_expired) for scans", () => {
  it("deletes unfinished and failed scans after 30 days, and keeps finished ones", async () => {
    await consentBoth(ALICE);
    const done = (await insertScan(ALICE, ", 'done', '{}'")).rows[0].id;
    const stuck = (await insertScan(ALICE)).rows[0].id;
    const recent = (await insertScan(ALICE)).rows[0].id;
    await db.query("insert into scans (user_id, adult_attested, height_cm, status, error_code) values ($1, true, 178, 'failed', 'no_person')", [
      ALICE,
    ]);
    await db.query("update scans set created_at = now() - interval '31 days' where id <> $1", [recent]);

    const { rows } = await db.query("select * from purge_expired()");
    expect(rows).toEqual([{ listings_deleted: 0, ai_runs_deleted: 0, scans_deleted: 2 }]);
    const left = (await db.query<{ id: string }>("select id from scans")).rows.map((r) => r.id);
    expect(left.sort()).toEqual([done, recent].sort());
    expect(left).not.toContain(stuck);
  });
});
