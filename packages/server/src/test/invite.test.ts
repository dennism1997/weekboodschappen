import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {clearMockSession, createMember, createTestUser, getTestDb, setMockSession, setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";

setupAuthMock();
setupTestDb();

const { default: app } = await import("../app.js");
const { default: request } = await import("supertest");

describe("Invite routes", () => {
  let db: ReturnType<typeof getTestDb>;
  let owner: { userId: string; orgId: string };

  beforeAll(() => {
    db = getTestDb();
    owner = createTestUser(db, "Owner", { orgName: "Test HH", createdAt: new Date("2020-01-01") });
  });

  afterAll(() => {
    teardownTestDb();
  });

  beforeEach(() => {
    clearMockSession();
  });

  describe("POST /api/invite/create", () => {
    it("creates an invite link", async () => {
      setMockSession(owner.userId, owner.orgId);
      const res = await request(app).post("/api/invite/create");
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.url).toContain("/invite/");
    });

    it("returns 401 when not authenticated", async () => {
      clearMockSession();
      const res = await request(app).post("/api/invite/create");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/invite/:token", () => {
    it("validates an active invite", async () => {
      setMockSession(owner.userId, owner.orgId);
      const createRes = await request(app).post("/api/invite/create");
      const { token } = createRes.body;

      clearMockSession();
      const res = await request(app).get(`/api/invite/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.householdName).toBe("Test HH");
    });

    it("returns 404 for nonexistent invite", async () => {
      const res = await request(app).get("/api/invite/nonexistent-token");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/invite/members", () => {
    it("returns members with last login info", async () => {
      setMockSession(owner.userId, owner.orgId);
      const res = await request(app).get("/api/invite/members");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty("lastLogin");
    });
  });

  describe("DELETE /api/invite/members/:userId", () => {
    it("owner can remove a member", async () => {
      // Add a member to remove
      const { user: userSchema } = await import("../db/auth-schema.js");
      const memberId = crypto.randomUUID();
      const now = new Date();
      db.insert(userSchema).values({
        id: memberId, name: "Removable", email: `${memberId}@test.local`,
        emailVerified: false, createdAt: now, updatedAt: now,
      }).run();
      createMember(db, memberId, owner.orgId, "member");

      setMockSession(owner.userId, owner.orgId);
      const res = await request(app).delete(`/api/invite/members/${memberId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("owner cannot remove themselves", async () => {
      setMockSession(owner.userId, owner.orgId);
      const res = await request(app).delete(`/api/invite/members/${owner.userId}`);
      expect(res.status).toBe(400);
    });
  });
});
