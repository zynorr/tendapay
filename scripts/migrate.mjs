import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const migrationsDirectory = path.join(process.cwd(), "db", "migrations");
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS tendapay_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const fileName of migrationFiles) {
    const existing = await client.query(
      `
        SELECT name
        FROM tendapay_schema_migrations
        WHERE name = $1
      `,
      [fileName],
    );

    if (existing.rowCount) {
      console.log(`skip ${fileName}`);
      continue;
    }

    const migration = await readFile(
      path.join(migrationsDirectory, fileName),
      "utf8",
    );

    await client.query("BEGIN");

    try {
      await client.query(migration);
      await client.query(
        "INSERT INTO tendapay_schema_migrations (name) VALUES ($1)",
        [fileName],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log(`applied ${fileName}`);
  }
} finally {
  client.release();
  await pool.end();
}
