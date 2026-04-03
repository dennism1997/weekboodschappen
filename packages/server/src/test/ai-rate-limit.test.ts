import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {clearMockSession, createTestUser, getTestDb, setMockSession, setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";

setupAuthMock();

// Mock AI services to avoid real API calls
vi.doMock("../services/ai.js", () => ({
  client: {},
  categorizeBatchWithAI: vi.fn(async () => ({})),
  getAICallCount: vi.fn(() => 0),
}));

vi.doMock("../services/ai-scraper.js", () => ({
  scrapeRecipe: vi.fn(async () => ({
    title: "Test Recipe",
    sourceUrl: "https://example.com",
    imageUrl: null,
    servings: 4,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    ingredients: [],
    instructions: [],
  })),
}));

vi.doMock("../services/recommendations.js", () => ({
  getRecommendations: vi.fn(async () => []),
  getCachedSuggestions: vi.fn(() => []),
  refreshCachedSuggestions: vi.fn(async () => {}),
}));

setupTestDb();

const { default: app } = await import("../app.js");
const { default: request } = await import("supertest");

describe("AI rate limiting", () => {
  let db: ReturnType<typeof getTestDb>;
  let testUser: { userId: string; orgId: string };

  beforeAll(() => {
    db = getTestDb();
    testUser = createTestUser(db, "Rate Limit User");
  });

  afterAll(() => {
    teardownTestDb();
  });

  beforeEach(() => {
    clearMockSession();
  });

  it("returns 401 for unauthenticated requests to AI endpoints", async () => {
    clearMockSession();

    const endpoints = [
      { method: "post", path: "/api/recipes/scrape", body: { url: "https://example.com/recipe" } },
      { method: "post", path: "/api/recipes/from-suggestion", body: { title: "Test", ingredients: ["a"] } },
      { method: "post", path: "/api/recipes/categorize", body: { ingredients: ["melk"] } },
      { method: "get", path: "/api/plans/current/recommendations" },
      { method: "post", path: "/api/plans/current/recommendations/refresh" },
      { method: "post", path: "/api/plans/current/recommendations/more", body: { exclude: [] } },
    ];

    for (const ep of endpoints) {
      const req = ep.method === "get"
        ? request(app).get(ep.path)
        : request(app).post(ep.path).send(ep.body);
      const res = await req;
      expect(res.status, `${ep.method.toUpperCase()} ${ep.path} should return 401`).toBe(401);
    }
  });

  it("allows authenticated requests to AI endpoints", async () => {
    setMockSession(testUser.userId, testUser.orgId);

    const res = await request(app)
      .post("/api/recipes/categorize")
      .send({ ingredients: ["melk"] });

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(429);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    setMockSession(testUser.userId, testUser.orgId);

    // Send 11 requests (limit is 10 per minute)
    const results = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post("/api/recipes/categorize")
        .send({ ingredients: ["melk"] });
      results.push(res.status);
    }

    // The 11th request should be rate limited
    expect(results[10]).toBe(429);
  });
});
