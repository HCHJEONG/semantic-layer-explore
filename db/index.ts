import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

const globalDatabase = globalThis as typeof globalThis & { physicalAiDb?: DbClient };

function resolveDatabasePath() {
  const configured = process.env.DATABASE_PATH?.trim();
  if (!configured) return path.join(process.cwd(), "data", "ai-workspace.sqlite");
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

function createDb() {
  const databasePath = resolveDatabasePath();
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export function getDb() {
  globalDatabase.physicalAiDb ??= createDb();
  return globalDatabase.physicalAiDb;
}

export function getDatabasePath() {
  return resolveDatabasePath();
}
