import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {createTestUser, getTestDb, setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";

setupAuthMock();
setupTestDb();

const { default: app } = await import("../app.js");
const { default: request } = await import("supertest");

describe("Registration routes", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeAll(() => {
    db = getTestDb();
    createTestUser(db, "Admin", { createdAt: new Date("2020-01-01") });
  });

  afterAll(() => {
    teardownTestDb();
  });

  describe("GET /api/register/status", () => {
    it("returns available: true when setup is complete", async () => {
      const res = await request(app).get("/api/register/status");
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });
  });

  describe("POST /api/register", () => {
    it("creates a new user with waiting household", async () => {
      const res = await request(app)
        .post("/api/register")
        .send({ name: "New User", householdName: "New Household" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBeDefined();
    });

    it("rejects missing name", async () => {
      const res = await request(app)
        .post("/api/register")
        .send({ householdName: "Test" });
      expect(res.status).toBe(400);
    });

    it("rejects missing household name", async () => {
      const res = await request(app)
        .post("/api/register")
        .send({ name: "Test" });
      expect(res.status).toBe(400);
    });
  });
});
