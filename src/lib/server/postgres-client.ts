import { Pool } from "pg";

let pool: Pool | undefined;

export function getPostgresPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for PostgreSQL persistence.");
  }

  pool ??= new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });

  return pool;
}
