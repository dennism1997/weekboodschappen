import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {clearMockSession, createTestUser, getTestDb, setMockSession, setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";

// Must call mocks before importing app
setupAuthMock();
setupTestDb();

// Dynamic import so mocks are in place
const { default: app } = await import("../app.js");
const { default: request } = await import("supertest");

describe("Admin routes", () => {
  let db: ReturnType<typeof getTestDb>;
  let admin: { userId: string; orgId: string };

  beforeAll(() => {
    db = getTestDb();
    // First user = admin
    admin = createTestUser(db, "Admin", { orgName: "Admin Household", createdAt: new Date("2020-01-01") });
  });

  afterAll(() => {
    teardownTestDb();
  });

  beforeEach(() => {
    clearMockSession();
  });

  describe("GET /api/admin/status", () => {
    it("returns isAdmin: true for the first user", async () => {
      setMockSession(admin.userId, admin.orgId);
      const res = await request(app).get("/api/admin/status");
      expect(res.status).toBe(200);
      expect(res.body.isAdmin).toBe(true);
    });

    it("returns isAdmin: false for a non-admin user", async () => {
      const other = createTestUser(db, "Regular User");
      setMockSession(other.userId, other.orgId);
      const res = await request(app).get("/api/admin/status");
      expect(res.status).toBe(200);
      expect(res.body.isAdmin).toBe(false);
    });

    it("returns isAdmin: false when not authenticated", async () => {
      clearMockSession();
      const res = await request(app).get("/api/admin/status");
      expect(res.status).toBe(200);
      expect(res.body.isAdmin).toBe(false);
    });
  });

  describe("GET /api/admin/households", () => {
    it("returns all households with stats for admin", async () => {
      setMockSession(admin.userId, admin.orgId);
      const res = await request(app).get("/api/admin/households");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const household = res.body.find((h: any) => h.id === admin.orgId);
      expect(household).toBeDefined();
      expect(household.name).toBe("Admin Household");
      expect(household.memberCount).toBeGreaterThanOrEqual(1);
      expect(household.members).toBeDefined();
    });

    it("returns 403 for non-admin user", async () => {
      const other = createTestUser(db, "NotAdmin");
      setMockSession(other.userId, other.orgId);
      const res = await request(app).get("/api/admin/households");
      expect(res.status).toBe(403);
    });

    it("returns 401 when not authenticated", async () => {
      clearMockSession();
      const res = await request(app).get("/api/admin/households");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/admin/households/:id/status", () => {
    it("approves a waiting household", async () => {
      const waiting = createTestUser(db, "Waiting User", { orgName: "Waiting HH", orgStatus: "waiting" });
      setMockSession(admin.userId, admin.orgId);

      const res = await request(app)
        .patch(`/api/admin/households/${waiting.orgId}/status`)
        .send({ status: "active" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("rejects invalid status", async () => {
      setMockSession(admin.userId, admin.orgId);
      const res = await request(app)
        .patch(`/api/admin/households/${admin.orgId}/status`)
        .send({ status: "invalid" });
      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent household", async () => {
      setMockSession(admin.userId, admin.orgId);
      const res = await request(app)
        .patch("/api/admin/households/nonexistent/status")
        .send({ status: "active" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/admin/households/:id", () => {
    it("deletes a household and its data", async () => {
      const toDelete = createTestUser(db, "Delete Me", { orgName: "Doomed HH" });
      setMockSession(admin.userId, admin.orgId);

      const res = await request(app).delete(`/api/admin/households/${toDelete.orgId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify household is gone
      const check = await request(app).get("/api/admin/households");
      const found = check.body.find((h: any) => h.id === toDelete.orgId);
      expect(found).toBeUndefined();
    });
  });

  describe("GET /api/admin/users", () => {
    it("returns all users with memberships", async () => {
      setMockSession(admin.userId, admin.orgId);
      const res = await request(app).get("/api/admin/users");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const adminUser = res.body.find((u: any) => u.id === admin.userId);
      expect(adminUser).toBeDefined();
      expect(adminUser.name).toBe("Admin");
      expect(adminUser.memberships).toBeDefined();
    });
  });

  describe("GET /api/admin/system", () => {
    it("returns system health metrics", async () => {
      setMockSession(admin.userId, admin.orgId);
      const res = await request(app).get("/api/admin/system");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("dbSizeMB");
      expect(res.body).toHaveProperty("discountLastRefresh");
      expect(res.body).toHaveProperty("aiCallCount");
    });
  });
});
