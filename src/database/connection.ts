import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const databasePath = resolve(projectRoot, config.databasePath);

mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

export function closeDatabase(): void {
  db.close();
}
