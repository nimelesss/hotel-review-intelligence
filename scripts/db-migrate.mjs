#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required for migration.");
  process.exit(1);
}

const migrationPath = path.resolve(
  process.cwd(),
  "src/server/db/postgres/migrations/001_init.sql"
);

if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, "utf8");
const pool = new Pool({
  connectionString: databaseUrl
});

try {
  console.log(`[db:migrate] applying ${migrationPath}`);
  await pool.query(sql);
  console.log("[db:migrate] done");
} catch (error) {
  console.error(
    `[db:migrate] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
