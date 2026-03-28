import Database, {type Database as DatabaseType} from "better-sqlite3";
import {drizzle} from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import {dirname} from "node:path";
import {mkdirSync} from "node:fs";

const dbPath = process.env.DATABASE_PATH || "./data/weekboodschappen.db";

// Ensure the directory exists
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite: DatabaseType = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("cache_size = -64000"); // 64MB
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
