import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db, closeDatabase } from "./connection.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const applied = new Set(
  db.prepare("SELECT name FROM migrations").all().map((row) => String((row as { name: string }).name)),
);

const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const migration of migrations) {
  if (applied.has(migration)) {
    continue;
  }

  const sql = readFileSync(join(migrationsDir, migration), "utf8");

  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.prepare("INSERT INTO migrations (name) VALUES (?)").run(migration);
    db.exec("COMMIT");
    console.log(`Applied migration: ${basename(migration)}`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (migrations.every((migration) => applied.has(migration))) {
  console.log("Database is already up to date.");
}

closeDatabase();
