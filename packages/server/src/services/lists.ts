import { db } from "../db/connection.js";
import {
  weeklyPlan,
  weeklyPlanRecipe,
  recipe,
  weeklyStaple,
  groceryList,
  groceryItem,
  storeConfig,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { mergeQuantities, type MergeableItem } from "../utils/units.js";
import { matchDiscountsToIngredients } from "./discounts.js";

/**
 * Generate a complete grocery list for a weekly plan.
 *
 * 1. Fetch all recipes in the plan with servings overrides
 * 2. Scale ingredient quantities by servings ratio
 * 3. Merge identical ingredients across recipes (fuzzy name matching)
 * 4. Add weekly staples from weeklyStaple table
 * 5. Assign categories to all items
 * 6. Fetch store category ordering from storeConfig
 * 7. Sort items by category order
 * 8. Insert into groceryItem table
 * 9. Return the complete list
 */
export function generateGroceryList(planId: string, householdId: string) {
  // 1. Fetch plan and its recipes
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(eq(weeklyPlan.id, planId))
    .get();

  if (!plan) {
    throw new Error("Plan not found");
  }

  const planRecipes = db
    .select({
      planRecipe: weeklyPlanRecipe,
      recipe: recipe,
    })
    .from(weeklyPlanRecipe)
    .innerJoin(recipe, eq(weeklyPlanRecipe.recipeId, recipe.id))
    .where(eq(weeklyPlanRecipe.weeklyPlanId, planId))
    .all();

  // 2. Scale ingredients by servings ratio and collect all items
  const allItems: MergeableItem[] = [];

  for (const pr of planRecipes) {
    const baseServings = pr.recipe.servings || 4;
    const actualServings = pr.planRecipe.servingsOverride || baseServings;
    const ratio = actualServings / baseServings;

    const ingredients = pr.recipe.ingredients as {
      name: string;
      quantity: number;
      unit: string;
      category: string;
    }[];

    for (const ing of ingredients) {
      allItems.push({
        name: ing.name,
        quantity: ing.quantity * ratio,
        unit: ing.unit,
        category: ing.category,
        source: "recipe",
        sourceRecipeId: pr.recipe.id,
      });
    }
  }

  // 3. Merge identical ingredients across recipes
  const mergedRecipeItems = mergeQuantities(allItems);

  // 4. Add weekly staples
  const staples = db
    .select()
    .from(weeklyStaple)
    .where(
      and(
        eq(weeklyStaple.householdId, householdId),
        eq(weeklyStaple.active, true),
      ),
    )
    .all();

  const stapleItems: MergeableItem[] = staples.map((s) => ({
    name: s.name,
    quantity: s.defaultQuantity,
    unit: s.unit,
    category: s.category,
    source: "staple" as const,
    sourceRecipeId: null,
  }));

  // Merge staples with recipe items (in case a staple overlaps with a recipe ingredient)
  const allMergedItems = mergeQuantities([...mergedRecipeItems, ...stapleItems]);

  // 5. Categories are already assigned from recipe ingredients and staples

  // 6. Fetch store category ordering
  const config = db
    .select()
    .from(storeConfig)
    .where(
      and(
        eq(storeConfig.householdId, householdId),
        eq(storeConfig.store, plan.store),
      ),
    )
    .get();

  const categoryOrder: string[] = config?.categoryOrder || [];

  // 7. Sort items by category order
  const sortedItems = allMergedItems.sort((a, b) => {
    const orderA = categoryOrder.indexOf(a.category);
    const orderB = categoryOrder.indexOf(b.category);
    // Unknown categories go to the end
    const posA = orderA === -1 ? categoryOrder.length : orderA;
    const posB = orderB === -1 ? categoryOrder.length : orderB;
    if (posA !== posB) return posA - posB;
    // Within same category, sort alphabetically
    return a.name.localeCompare(b.name, "nl");
  });

  // 8. Create grocery list and insert items
  const listId = crypto.randomUUID();
  db.insert(groceryList)
    .values({
      id: listId,
      weeklyPlanId: planId,
    })
    .run();

  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];
    db.insert(groceryItem)
      .values({
        id: crypto.randomUUID(),
        groceryListId: listId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        source: item.source || "recipe",
        sourceRecipeId: item.sourceRecipeId || null,
        sortOrder: i,
      })
      .run();
  }

  // 9. Match discounts to grocery items
  try {
    const itemNames = sortedItems.map((item) => item.name);
    const discountMatches = matchDiscountsToIngredients(itemNames, plan.store);

    // Update items that have a matching discount
    const insertedItems = db
      .select()
      .from(groceryItem)
      .where(eq(groceryItem.groceryListId, listId))
      .all();

    for (const item of insertedItems) {
      const match = discountMatches[item.name];
      if (match) {
        db.update(groceryItem)
          .set({
            discountInfo: {
              store: match.store,
              percentage: match.percentage,
              originalPrice: match.originalPrice,
              salePrice: match.salePrice,
            },
          })
          .where(eq(groceryItem.id, item.id))
          .run();
      }
    }
  } catch (err) {
    // Discount matching is non-critical — log and continue
    console.error("Failed to match discounts to grocery items:", err);
  }

  // 10. Return the complete list
  const list = db
    .select()
    .from(groceryList)
    .where(eq(groceryList.id, listId))
    .get();

  const items = db
    .select()
    .from(groceryItem)
    .where(eq(groceryItem.groceryListId, listId))
    .all();

  return {
    ...list,
    items,
  };
}
