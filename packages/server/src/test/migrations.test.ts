import {describe, expect, it, afterAll} from "vitest";
import Database from "better-sqlite3";
import {drizzle} from "drizzle-orm/better-sqlite3";
import {migrate} from "drizzle-orm/better-sqlite3/migrator";
import {join} from "node:path";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";

const migrationsFolder = join(import.meta.dirname, "../../migrations");

function createFreshDb() {
  const dir = mkdtempSync(join(tmpdir(), "migration-test-"));
  const sqlite = new Database(join(dir, "test.db"));
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite);
  return { sqlite, db, dir };
}

describe("Database migrations", () => {
  const instances: { sqlite: InstanceType<typeof Database>; dir: string }[] = [];

  afterAll(() => {
    for (const { sqlite, dir } of instances) {
      try { sqlite.close(); } catch {}
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });

  it("runs all migrations on a fresh database without errors", () => {
    const { sqlite, db, dir } = createFreshDb();
    instances.push({ sqlite, dir });

    expect(() => migrate(db, { migrationsFolder })).not.toThrow();
  });

  it("creates all expected tables", () => {
    const { sqlite, db, dir } = createFreshDb();
    instances.push({ sqlite, dir });
    migrate(db, { migrationsFolder });

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name")
      .all()
      .map((row: any) => row.name);

    const expected = [
      "account",
      "cached_suggestion",
      "favorite_website",
      "grocery_item",
      "grocery_list",
      "invitation",
      "member",
      "organization",
      "passkey",
      "product_discount",
      "recipe",
      "recovery_token",
      "session",
      "shopping_history",
      "store_config",
      "user",
      "verification",
      "weekly_plan",
      "weekly_plan_recipe",
      "weekly_staple",
    ];

    for (const table of expected) {
      expect(tables, `Missing table: ${table}`).toContain(table);
    }
  });

  it("grocery_list has household_id column", () => {
    const { sqlite, db, dir } = createFreshDb();
    instances.push({ sqlite, dir });
    migrate(db, { migrationsFolder });

    const columns = sqlite
      .prepare("PRAGMA table_info(grocery_list)")
      .all()
      .map((col: any) => col.name);

    expect(columns).toContain("household_id");
    expect(columns).toContain("weekly_plan_id");
  });

  it("grocery_list.weekly_plan_id is nullable", () => {
    const { sqlite, db, dir } = createFreshDb();
    instances.push({ sqlite, dir });
    migrate(db, { migrationsFolder });

    const columns = sqlite
      .prepare("PRAGMA table_info(grocery_list)")
      .all() as any[];

    const weeklyPlanId = columns.find((c) => c.name === "weekly_plan_id");
    expect(weeklyPlanId.notnull, "weekly_plan_id should be nullable").toBe(0);
  });

  it("recipe has status column with correct default", () => {
    const { sqlite, db, dir } = createFreshDb();
    instances.push({ sqlite, dir });
    migrate(db, { migrationsFolder });

    const columns = sqlite
      .prepare("PRAGMA table_info(recipe)")
      .all() as any[];

    const status = columns.find((c: any) => c.name === "status");
    expect(status, "recipe.status column should exist").toBeDefined();
    expect(status.dflt_value).toBe("'ready'");
  });

  it("migrations are idempotent (running twice does not error)", () => {
    const { sqlite, db, dir } = createFreshDb();
    instances.push({ sqlite, dir });

    migrate(db, { migrationsFolder });
    expect(() => migrate(db, { migrationsFolder })).not.toThrow();
  });

  it("records all migrations in __drizzle_migrations", () => {
    const { sqlite, db, dir } = createFreshDb();
    instances.push({ sqlite, dir });
    migrate(db, { migrationsFolder });

    const count = sqlite
      .prepare("SELECT COUNT(*) as count FROM __drizzle_migrations")
      .get() as any;

    // Should have at least 12 migrations (0000 through 0011)
    expect(count.count).toBeGreaterThanOrEqual(12);
  });

  it("foreign keys are valid after migration", () => {
    const { sqlite, db, dir } = createFreshDb();
    instances.push({ sqlite, dir });
    migrate(db, { migrationsFolder });

    sqlite.pragma("foreign_keys = ON");
    const fkCheck = sqlite.pragma("foreign_key_check") as any[];
    expect(fkCheck, "Foreign key violations found").toHaveLength(0);
  });
});
