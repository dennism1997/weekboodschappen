import Database from "better-sqlite3";
import {drizzle} from "drizzle-orm/better-sqlite3";
import {migrate} from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../db/schema.js";
import {account, member, organization, user} from "../db/auth-schema.js";
import {join} from "node:path";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import crypto from "node:crypto";
import {vi} from "vitest";

// --- Types ---

export interface TestUser {
  userId: string;
  orgId: string;
  sessionToken: string;
}

// --- Temp DB ---

let tempDir: string;
let sqlite: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

export function setupTestDb() {
  tempDir = mkdtempSync(join(tmpdir(), "weekboodschappen-test-"));
  const dbPath = join(tempDir, "test.db");
  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  testDb = drizzle(sqlite, { schema });

  // Run migrations
  const migrationsFolder = join(import.meta.dirname, "../../migrations");
  migrate(testDb, { migrationsFolder });

  // Mock the db module so all route code uses our test DB
  vi.doMock("../db/connection.js", () => ({
    db: testDb,
    sqlite,
  }));

  return testDb;
}

export function teardownTestDb() {
  try {
    sqlite?.close();
  } catch {
    // ignore
  }
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function getTestDb() {
  return testDb;
}

// --- Auth Mock ---

let mockSession: { user: { id: string; name: string }; session: { id: string; activeOrganizationId: string } } | null = null;

export function setMockSession(userId: string, orgId: string, userName: string = "Test User") {
  mockSession = {
    user: { id: userId, name: userName },
    session: { id: crypto.randomUUID(), activeOrganizationId: orgId },
  };
}

export function clearMockSession() {
  mockSession = null;
}

export function setupAuthMock() {
  vi.doMock("../auth.js", () => ({
    auth: {
      api: {
        getSession: vi.fn(async () => mockSession),
        signUpEmail: vi.fn(async ({ body }: { body: { email: string; password: string; name: string } }) => {
          // Create user directly in test DB
          const userId = crypto.randomUUID();
          const now = new Date();
          testDb.insert(user).values({
            id: userId,
            name: body.name,
            email: body.email,
            emailVerified: false,
            createdAt: now,
            updatedAt: now,
          }).run();
          testDb.insert(account).values({
            id: crypto.randomUUID(),
            accountId: userId,
            providerId: "credential",
            userId,
            password: body.password,
            createdAt: now,
            updatedAt: now,
          }).run();
          return { user: { id: userId, name: body.name, email: body.email } };
        }),
      },
      handler: vi.fn(async () => new Response(null, { headers: new Headers() })),
    },
  }));
}

// --- Seed Helpers ---

export function createUser(db: ReturnType<typeof drizzle>, name: string, createdAt?: Date): string {
  const id = crypto.randomUUID();
  const now = createdAt ?? new Date();
  db.insert(user).values({
    id,
    name,
    email: `${crypto.randomUUID()}@test.local`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  }).run();
  return id;
}

export function createOrganization(
  db: ReturnType<typeof drizzle>,
  name: string,
  status: "active" | "waiting" | "deactivated" = "active",
): string {
  const id = crypto.randomUUID();
  db.insert(organization).values({
    id,
    name,
    slug: crypto.randomUUID().slice(0, 8),
    createdAt: new Date(),
    status,
  }).run();
  return id;
}

export function createMember(
  db: ReturnType<typeof drizzle>,
  userId: string,
  orgId: string,
  role: "owner" | "member" = "owner",
): void {
  db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role,
    createdAt: new Date(),
  }).run();
}

/**
 * Create a complete test user with organization and membership.
 * The first user created in a test DB is the admin.
 */
export function createTestUser(
  db: ReturnType<typeof drizzle>,
  name: string,
  opts?: { orgName?: string; orgStatus?: "active" | "waiting" | "deactivated"; role?: "owner" | "member"; createdAt?: Date },
): { userId: string; orgId: string } {
  const userId = createUser(db, name, opts?.createdAt);
  const orgId = createOrganization(db, opts?.orgName ?? `${name}'s household`, opts?.orgStatus ?? "active");
  createMember(db, userId, orgId, opts?.role ?? "owner");
  return { userId, orgId };
}
