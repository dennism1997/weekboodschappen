import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {createTestUser, getTestDb, setMockSession, setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";
import {eq} from "drizzle-orm";

setupAuthMock();
setupTestDb();

const {groceryItem, groceryList, recipe, weeklyPlan, weeklyPlanRecipe} = await import("../db/schema.js");
const {generateGroceryList} = await import("../services/lists.js");
const {default: app} = await import("../app.js");
const {default: request} = await import("supertest");

describe("Grocery list", () => {
  let db: ReturnType<typeof getTestDb>;
  let householdId: string;
  let userId: string;

  beforeAll(() => {
    db = getTestDb();
    const testUser = createTestUser(db, "Grocery Test User");
    householdId = testUser.orgId;
    userId = testUser.userId;
  });

  afterAll(() => {
    teardownTestDb();
  });

  describe("GET /lists/current", () => {
    it("creates a list if none exists", async () => {
      setMockSession(userId, householdId);

      const res = await request(app).get("/api/lists/current");
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.items).toEqual([]);
    });

    it("returns the same list on subsequent calls", async () => {
      setMockSession(userId, householdId);

      const res1 = await request(app).get("/api/lists/current");
      const res2 = await request(app).get("/api/lists/current");
      expect(res1.body.id).toBe(res2.body.id);
    });

    it("returns 401 for unauthenticated requests", async () => {
      const {clearMockSession} = await import("./setup.js");
      clearMockSession();
      const res = await request(app).get("/api/lists/current");
      expect(res.status).toBe(401);
    });
  });

  describe("adding manual items without a plan", () => {
    it("allows adding items to the list without any weekly plan", async () => {
      setMockSession(userId, householdId);

      // Get the household list
      const listRes = await request(app).get("/api/lists/current");
      const listId = listRes.body.id;

      // Add a manual item
      const addRes = await request(app)
        .post(`/api/lists/${listId}/items`)
        .send({ name: "Brood", quantity: 1, unit: "stuk", category: "Brood & Bakkerij" });

      expect(addRes.status).toBe(201);
      expect(addRes.body.name).toBe("Brood");
      expect(addRes.body.source).toBe("manual");

      // Verify it shows up in the list
      const updatedRes = await request(app).get("/api/lists/current");
      const items = updatedRes.body.items;
      expect(items.some((i: any) => i.name === "Brood")).toBe(true);
    });
  });

  describe("generateGroceryList", () => {
    it("preserves manual items when generating from a plan", async () => {
      setMockSession(userId, householdId);

      // Get the household list and clear any items from previous tests
      const listRes = await request(app).get("/api/lists/current");
      const listId = listRes.body.id;
      db.delete(groceryItem).where(eq(groceryItem.groceryListId, listId)).run();

      const manualItemId = crypto.randomUUID();
      db.insert(groceryItem).values({
        id: manualItemId,
        groceryListId: listId,
        name: "Kaas",
        quantity: 1,
        unit: "stuk",
        category: "Zuivel",
        source: "manual",
        sortOrder: 100,
      }).run();

      // Create a plan with a recipe
      const planId = crypto.randomUUID();
      db.insert(weeklyPlan).values({
        id: planId,
        householdId,
        weekStart: "2026-03-30",
        store: "jumbo",
      }).run();

      const recipeId = crypto.randomUUID();
      db.insert(recipe).values({
        id: recipeId,
        householdId,
        title: "Pasta Bolognese",
        servings: 4,
        ingredients: [
          {name: "Pasta", quantity: 500, unit: "g", category: "Pasta & Rijst"},
          {name: "Gehakt", quantity: 400, unit: "g", category: "Vlees"},
        ],
        instructions: [],
        tags: [],
      }).run();

      db.insert(weeklyPlanRecipe).values({
        id: crypto.randomUUID(),
        weeklyPlanId: planId,
        recipeId,
        servingsOverride: 4,
      }).run();

      // Generate the list — should reuse the household list
      const generated = generateGroceryList(planId, householdId);

      // Should reuse the same list
      expect(generated.id).toBe(listId);

      // Manual item should still be there
      const manualItems = generated.items.filter((i: any) => i.source === "manual");
      expect(manualItems).toHaveLength(1);
      expect(manualItems[0].name).toBe("Kaas");
      expect(manualItems[0].id).toBe(manualItemId);

      // Recipe items should be present
      const recipeItems = generated.items.filter((i: any) => i.source === "recipe");
      expect(recipeItems.length).toBeGreaterThan(0);
    });

    it("links the list to the plan after generation", () => {
      const list = db.select().from(groceryList)
        .where(eq(groceryList.householdId, householdId))
        .get();
      expect(list?.weeklyPlanId).toBeDefined();
    });
  });

  describe("deleting a plan with a linked grocery list", () => {
    it("does not fail with FK constraint", async () => {
      setMockSession(userId, householdId);

      // Create a plan
      const planId = crypto.randomUUID();
      db.insert(weeklyPlan).values({
        id: planId,
        householdId,
        weekStart: "2026-04-13",
        store: "jumbo",
      }).run();

      // Link the household list to this plan
      const list = db.select().from(groceryList)
        .where(eq(groceryList.householdId, householdId))
        .get();
      if (list) {
        db.update(groceryList)
          .set({ weeklyPlanId: planId })
          .where(eq(groceryList.id, list.id))
          .run();
      }

      // Delete the plan — should not throw
      const res = await request(app).delete(`/api/plans/${planId}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Grocery list should still exist but unlinked
      const listAfter = db.select().from(groceryList)
        .where(eq(groceryList.householdId, householdId))
        .get();
      expect(listAfter).toBeDefined();
      expect(listAfter!.weeklyPlanId).toBeNull();
    });
  });
});
