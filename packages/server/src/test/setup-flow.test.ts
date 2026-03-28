import {afterAll, describe, expect, it} from "vitest";
import {setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";

setupAuthMock();
setupTestDb();

const { default: app } = await import("../app.js");
const { default: request } = await import("supertest");

describe("Setup flow", () => {
  afterAll(() => {
    teardownTestDb();
  });

  it("GET /api/setup/status returns needsSetup: true when no users", async () => {
    const res = await request(app).get("/api/setup/status");
    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(true);
  });

  it("POST /api/setup creates first user and active household", async () => {
    const res = await request(app)
      .post("/api/setup")
      .send({ name: "Dennis", householdName: "Huishouden Mouwen" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.userId).toBeDefined();
    expect(res.body.recoveryCode).toBeDefined();
  });

  it("GET /api/setup/status returns needsSetup: false after setup", async () => {
    const res = await request(app).get("/api/setup/status");
    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(false);
  });

  it("POST /api/setup rejects when already set up", async () => {
    const res = await request(app)
      .post("/api/setup")
      .send({ name: "Hacker", householdName: "Evil HH" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Setup already completed");
  });

  it("POST /api/setup rejects missing fields", async () => {
    const res = await request(app).post("/api/setup").send({});
    expect(res.status).toBe(400);
  });
});
