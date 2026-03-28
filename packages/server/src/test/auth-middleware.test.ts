import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {clearMockSession, createTestUser, getTestDb, setMockSession, setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";

setupAuthMock();
setupTestDb();

const { default: app } = await import("../app.js");
const { default: request } = await import("supertest");

describe("Auth middleware - household status", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeAll(() => {
    db = getTestDb();
    createTestUser(db, "Admin", { createdAt: new Date("2020-01-01") });
  });

  afterAll(() => {
    teardownTestDb();
  });

  beforeEach(() => {
    clearMockSession();
  });

  it("allows requests with active household", async () => {
    const active = createTestUser(db, "Active User", { orgStatus: "active" });
    setMockSession(active.userId, active.orgId);

    const res = await request(app).get("/api/staples");
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("returns 403 HOUSEHOLD_PENDING for waiting household", async () => {
    const waiting = createTestUser(db, "Waiting User", { orgStatus: "waiting" });
    setMockSession(waiting.userId, waiting.orgId);

    const res = await request(app).get("/api/staples");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("HOUSEHOLD_PENDING");
  });

  it("returns 403 HOUSEHOLD_DEACTIVATED for deactivated household", async () => {
    const deactivated = createTestUser(db, "Deactivated User", { orgStatus: "deactivated" });
    setMockSession(deactivated.userId, deactivated.orgId);

    const res = await request(app).get("/api/staples");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("HOUSEHOLD_DEACTIVATED");
  });

  it("returns 401 when not authenticated", async () => {
    clearMockSession();
    const res = await request(app).get("/api/staples");
    expect(res.status).toBe(401);
  });
});
