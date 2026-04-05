import {db} from "../db/connection.js";
import {groceryItem, groceryList, recipe, shoppingHistory, weeklyPlan, weeklyPlanRecipe, weeklyStaple,} from "../db/schema.js";
import {and, eq, sql} from "drizzle-orm";

/**
 * Record a completed shopping trip into shoppingHistory,
 * update recipe cook counts, and mark the plan as completed.
 */
export function recordShoppingTrip(listId: string, householdId: string) {
  // 1. Get the grocery list
  const list = db
    .select()
    .from(groceryList)
    .where(eq(groceryList.id, listId))
    .get();

  if (!list) {
    throw new Error("List not found");
  }

  // 2. Get the associated weekly plan (if any)
  const plan = list.weeklyPlanId
    ? db
        .select()
        .from(weeklyPlan)
        .where(
          and(
            eq(weeklyPlan.id, list.weeklyPlanId),
            eq(weeklyPlan.householdId, householdId),
          ),
        )
        .get()
    : null;

  // 1b. Get all grocery items for this list
  const items = db
    .select()
    .from(groceryItem)
    .where(eq(groceryItem.groceryListId, listId))
    .all();

  // 3. Insert each grocery item into shoppingHistory
  for (const item of items) {
    db.insert(shoppingHistory)
      .values({
        id: crypto.randomUUID(),
        householdId,
        groceryItemId: item.id,
        itemName: item.name,
        category: item.category,
        wasPurchased: item.status === "checked",
        weekStart: plan?.weekStart ?? new Date().toISOString().split("T")[0],
        store: plan?.store ?? "albert_heijn",
      })
      .run();
  }

  // 4. If there's a plan, get all recipes and increment timesCooked
  if (plan) {
    const planRecipes = db
      .select()
      .from(weeklyPlanRecipe)
      .where(eq(weeklyPlanRecipe.weeklyPlanId, plan.id))
      .all();

    const now = new Date().toISOString();
    for (const pr of planRecipes) {
      db.update(recipe)
        .set({
          timesCooked: sql`${recipe.timesCooked} + 1`,
          lastCookedAt: now,
        })
        .where(eq(recipe.id, pr.recipeId))
        .run();
    }

    // 5. Update the weekly plan status to completed
    db.update(weeklyPlan)
      .set({ status: "completed" })
      .where(eq(weeklyPlan.id, plan.id))
      .run();
  }

  return items.length;
}

/**
 * Suggest staple items: items bought in 4+ distinct weeks
 * that are not already in weeklyStaple.
 */
export function suggestStaples(householdId: string) {
  const results = db
    .select({
      itemName: shoppingHistory.itemName,
      category: shoppingHistory.category,
      weekCount: sql<number>`count(distinct ${shoppingHistory.weekStart})`,
    })
    .from(shoppingHistory)
    .where(
      and(
        eq(shoppingHistory.householdId, householdId),
        eq(shoppingHistory.wasPurchased, true),
      ),
    )
    .groupBy(shoppingHistory.itemName, shoppingHistory.category)
    .having(sql`count(distinct ${shoppingHistory.weekStart}) >= 4`)
    .all();

  // Filter out items already in weeklyStaple
  const existingStaples = db
    .select({ name: weeklyStaple.name })
    .from(weeklyStaple)
    .where(eq(weeklyStaple.householdId, householdId))
    .all();

  const stapleNames = new Set(
    existingStaples.map((s) => s.name.toLowerCase()),
  );

  return results.filter((r) => !stapleNames.has(r.itemName.toLowerCase()));
}

/**
 * Get preference signals for a household to inform AI suggestions.
 */
export function getPreferenceSignals(householdId: string) {
  // frequentRecipes: recipes with timesCooked >= 3, sorted desc, limit 10
  // language=SQL format=false
const frequentRecipes = db
    .select({
      id: recipe.id,
      title: recipe.title,
      timesCooked: recipe.timesCooked,
      lastCookedAt: recipe.lastCookedAt,
    })
    .from(recipe)
    .where(
      and(
        eq(recipe.householdId, householdId),
        sql`${recipe.timesCooked} >= 3`,
      ),
    )
    .orderBy(sql`${recipe.timesCooked} desc`)
    .limit(10)
    .all();

  // recentRecipes: last 8 weeks of cooked recipes (from shoppingHistory weekStart)
  // Get the 8 most recent distinct weekStarts
  const recentWeeks = db
    .selectDistinct({ weekStart: shoppingHistory.weekStart })
    .from(shoppingHistory)
    .where(eq(shoppingHistory.householdId, householdId))
    .orderBy(sql`${shoppingHistory.weekStart} desc`)
    .limit(8)
    .all();

  const weekStartValues = recentWeeks.map((w) => w.weekStart);

  let recentRecipes: { id: string; title: string; weekStart: string }[] = [];
  if (weekStartValues.length > 0) {
    // Get recipes from plans in those weeks
    recentRecipes = db
      .select({
        id: recipe.id,
        title: recipe.title,
        weekStart: weeklyPlan.weekStart,
      })
      .from(weeklyPlanRecipe)
      .innerJoin(recipe, eq(weeklyPlanRecipe.recipeId, recipe.id))
      .innerJoin(
        weeklyPlan,
        eq(weeklyPlanRecipe.weeklyPlanId, weeklyPlan.id),
      )
      .where(
        and(
          eq(weeklyPlan.householdId, householdId),
          eq(weeklyPlan.status, "completed"),
          sql`${weeklyPlan.weekStart} in (${sql.join(
            weekStartValues.map((w) => sql`${w}`),
            sql`, `,
          )})`,
        ),
      )
      .all();
  }

  // neverSkipped: ingredient names that were never skipped in recent lists
  // Get all grocery items from recent completed plans
  const recentItems = db
    .select({
      name: groceryItem.name,
      status: groceryItem.status,
    })
    .from(groceryItem)
    .innerJoin(groceryList, eq(groceryItem.groceryListId, groceryList.id))
    .innerJoin(weeklyPlan, eq(groceryList.weeklyPlanId, weeklyPlan.id))
    .where(
      and(
        eq(weeklyPlan.householdId, householdId),
        eq(weeklyPlan.status, "completed"),
      ),
    )
    .all();

  // Find names that were never skipped
  const skippedNames = new Set<string>();
  const allNames = new Set<string>();

  for (const item of recentItems) {
    const lowerName = item.name.toLowerCase();
    allNames.add(lowerName);
    if (item.status === "skipped") {
      skippedNames.add(lowerName);
    }
  }

  const neverSkipped = [...allNames].filter(
    (name) => !skippedNames.has(name),
  );

  return {
    frequentRecipes,
    recentRecipes,
    neverSkipped,
  };
}
