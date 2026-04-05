import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {createTestUser, getTestDb, setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";
import {eq} from "drizzle-orm";

setupAuthMock();
setupTestDb();

const {groceryItem, recipe, weeklyPlan, weeklyPlanRecipe} = await import("../db/schema.js");
const {generateGroceryList} = await import("../services/lists.js");

describe("generateGroceryList", () => {
  let db: ReturnType<typeof getTestDb>;
  let householdId: string;
  let planId: string;

  beforeAll(() => {
    db = getTestDb();
    const testUser = createTestUser(db, "Grocery Test User");
    householdId = testUser.orgId;

    // Create a weekly plan
    planId = crypto.randomUUID();
    db.insert(weeklyPlan).values({
      id: planId,
      householdId,
      weekStart: "2026-03-30",
      store: "jumbo",
    }).run();

    // Create a recipe with ingredients
    const recipeId = crypto.randomUUID();
    db.insert(recipe).values({
      id: recipeId,
      householdId,
      title: "Pasta Bolognese",
      servings: 4,
      ingredients: [
        { name: "Pasta", quantity: 500, unit: "g", category: "Pasta & Rijst" },
        { name: "Gehakt", quantity: 400, unit: "g", category: "Vlees" },
      ],
      instructions: [],
      tags: [],
    }).run();

    // Add recipe to plan
    db.insert(weeklyPlanRecipe).values({
      id: crypto.randomUUID(),
      weeklyPlanId: planId,
      recipeId,
      servingsOverride: 4,
    }).run();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("preserves manual items when regenerating the list", () => {
    // Generate the initial list
    const list = generateGroceryList(planId, householdId);
    const listId = list.id;

    // Add a manual item to the list
    const manualItemId = crypto.randomUUID();
    db.insert(groceryItem).values({
      id: manualItemId,
      groceryListId: listId!,
      name: "Kaas",
      quantity: 1,
      unit: "stuk",
      category: "Zuivel",
      source: "manual",
      sortOrder: 100,
    }).run();

    // Verify manual item exists
    const itemsBefore = db.select().from(groceryItem).where(eq(groceryItem.groceryListId, listId!)).all();
    const manualBefore = itemsBefore.filter((i) => i.source === "manual");
    expect(manualBefore).toHaveLength(1);
    expect(manualBefore[0].name).toBe("Kaas");

    // Regenerate the list
    const regenerated = generateGroceryList(planId, householdId);

    // Should reuse the same list
    expect(regenerated.id).toBe(listId);

    // Manual item should still be there
    const itemsAfter = regenerated.items;
    const manualAfter = itemsAfter.filter((i: any) => i.source === "manual");
    expect(manualAfter).toHaveLength(1);
    expect(manualAfter[0].name).toBe("Kaas");
    expect(manualAfter[0].id).toBe(manualItemId);

    // Recipe items should be regenerated
    const recipeItems = itemsAfter.filter((i: any) => i.source === "recipe");
    expect(recipeItems.length).toBeGreaterThan(0);
  });

  it("generates recipe and staple items correctly", () => {
    // Create a fresh plan without an existing list
    const freshPlanId = crypto.randomUUID();
    db.insert(weeklyPlan).values({
      id: freshPlanId,
      householdId,
      weekStart: "2026-04-06",
      store: "jumbo",
    }).run();

    const recipeId = crypto.randomUUID();
    db.insert(recipe).values({
      id: recipeId,
      householdId,
      title: "Salade",
      servings: 2,
      ingredients: [
        { name: "Sla", quantity: 1, unit: "stuk", category: "Groente & Fruit" },
      ],
      instructions: [],
      tags: [],
    }).run();

    db.insert(weeklyPlanRecipe).values({
      id: crypto.randomUUID(),
      weeklyPlanId: freshPlanId,
      recipeId,
      servingsOverride: 2,
    }).run();

    const list = generateGroceryList(freshPlanId, householdId);
    expect(list.items.length).toBeGreaterThan(0);

    const sla = list.items.find((i: any) => i.name === "Sla");
    expect(sla).toBeDefined();
    expect(sla!.source).toBe("recipe");
  });
});
