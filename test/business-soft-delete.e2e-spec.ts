import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

describe('Business soft deletion and SQL restoration (PostgreSQL)', () => {
  let client: Client;

  beforeEach(async () => {
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    await client.query('BEGIN');
    const schema = `soft_delete_test_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query(`
      CREATE TABLE "Brand" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "Location" (
        "id" TEXT PRIMARY KEY,
        "brandId" TEXT NOT NULL REFERENCES "Brand"("id") ON DELETE CASCADE
      );
      CREATE INDEX "Location_brandId_idx" ON "Location"("brandId");
      CREATE TABLE "Booking" (
        "id" TEXT PRIMARY KEY,
        "locationId" TEXT NOT NULL REFERENCES "Location"("id") ON DELETE CASCADE
      );
      INSERT INTO "Brand" ("id") VALUES ('brand');
      INSERT INTO "Location" ("id", "brandId") VALUES ('active', 'brand'), ('previously-deleted', 'brand');
      INSERT INTO "Booking" ("id", "locationId") VALUES ('retained-booking', 'active');
    `);
    const migration = await readFile(
      new URL(
        '../src/database/migrations/20261015180000_business_soft_delete/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await client.query(migration);
  });

  afterEach(async () => {
    try {
      await client?.query('ROLLBACK');
    } finally {
      await client?.end();
    }
  });

  it('preserves bookings and independent child deletion when restoring a brand', async () => {
    await client.query(
      `UPDATE "Location" SET "deletedAt" = timezone('UTC', statement_timestamp()) WHERE "id" = 'previously-deleted'`,
    );
    await client.query(
      `UPDATE "Brand" SET "deletedAt" = timezone('UTC', statement_timestamp()) WHERE "id" = 'brand'`,
    );
    const activeBefore = await client.query(
      `SELECT l."id" FROM "Location" l JOIN "Brand" b ON b."id" = l."brandId" WHERE l."deletedAt" IS NULL AND b."deletedAt" IS NULL`,
    );
    expect(activeBefore.rows).toEqual([]);
    expect((await client.query('SELECT "id" FROM "Booking"')).rows).toEqual([
      { id: 'retained-booking' },
    ]);

    await client.query(
      `UPDATE "Brand" SET "deletedAt" = NULL WHERE "id" = 'brand'`,
    );
    const activeAfter = await client.query(
      `SELECT l."id" FROM "Location" l JOIN "Brand" b ON b."id" = l."brandId" WHERE l."deletedAt" IS NULL AND b."deletedAt" IS NULL`,
    );
    expect(activeAfter.rows).toEqual([{ id: 'active' }]);
    const restored = await client.query(
      `SELECT "restoredAt" IS NOT NULL AS captured FROM "Brand" WHERE "id" = 'brand'`,
    );
    expect(restored.rows[0].captured).toBe(true);
    expect(
      (await client.query('SELECT COUNT(*)::int AS count FROM "Booking"'))
        .rows[0].count,
    ).toBe(1);
  });

  it('records location restoration in UTC and keeps the cutoff on unrelated updates', async () => {
    await client.query(`SET LOCAL TIME ZONE 'Pacific/Honolulu'`);
    await client.query(
      `UPDATE "Location" SET "deletedAt" = timezone('UTC', statement_timestamp()) WHERE "id" = 'active'`,
    );
    await client.query(
      `UPDATE "Location" SET "deletedAt" = NULL WHERE "id" = 'active'`,
    );
    const captured = await client.query(
      `SELECT "restoredAt" > timezone('UTC', statement_timestamp()) - interval '5 seconds' AS recent FROM "Location" WHERE "id" = 'active'`,
    );
    expect(captured.rows[0].recent).toBe(true);
    const before = await client.query(
      `SELECT "restoredAt"::text AS cutoff FROM "Location" WHERE "id" = 'active'`,
    );
    await client.query(
      `UPDATE "Location" SET "deletedAt" = NULL WHERE "id" = 'active'`,
    );
    const after = await client.query(
      `SELECT "restoredAt"::text AS cutoff FROM "Location" WHERE "id" = 'active'`,
    );
    expect(after.rows).toEqual(before.rows);
  });
});
