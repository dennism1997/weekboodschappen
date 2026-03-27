import { Router } from "express";
import { db } from "../db/connection.js";
import {
  weeklyPlan,
  weeklyPlanRecipe,
  recipe,
  groceryList,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { generateGroceryList } from "../services/lists.js";
import { getRecommendations } from "../services/recommendations.js";

const router = Router();
router.use(requireAuth);

function normalizeStore(input: string): "jumbo" | "albert_heijn" {
  const lower = input.toLowerCase().replace(/\s+/g, "_");
  if (lower === "jumbo") return "jumbo";
  return "albert_heijn";
}

function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

function getPlanWithRecipes(planId: string) {
  const plan = db.select().from(weeklyPlan).where(eq(weeklyPlan.id, planId)).get();
  if (!plan) return null;

  const planRecipes = db
    .select({ planRecipe: weeklyPlanRecipe, recipe: recipe })
    .from(weeklyPlanRecipe)
    .innerJoin(recipe, eq(weeklyPlanRecipe.recipeId, recipe.id))
    .where(eq(weeklyPlanRecipe.weeklyPlanId, planId))
    .all();

  // Check if a grocery list exists for this plan
  const list = db
    .select()
    .from(groceryList)
    .where(eq(groceryList.weeklyPlanId, planId))
    .get();

  return {
    ...plan,
    listId: list?.id || null,
    recipes: planRecipes.map((pr) => ({
      recipeId: pr.planRecipe.recipeId,
      title: pr.recipe.title,
      servings: pr.planRecipe.servingsOverride || pr.recipe.servings,
      day: pr.planRecipe.dayOfWeek != null
        ? ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"][pr.planRecipe.dayOfWeek]
        : null,
    })),
  };
}

// POST / — Create a weekly plan
router.post("/", (req, res) => {
  const householdId = req.user!.householdId;
  const weekStart = getCurrentWeekStart();

  const existing = db
    .select()
    .from(weeklyPlan)
    .where(
      and(eq(weeklyPlan.householdId, householdId), eq(weeklyPlan.weekStart, weekStart)),
    )
    .get();

  if (existing) {
    const result = getPlanWithRecipes(existing.id);
    res.json(result);
    return;
  }

  const store = req.body.store ? normalizeStore(req.body.store) : "albert_heijn";

  const id = crypto.randomUUID();
  db.insert(weeklyPlan)
    .values({ id, householdId, weekStart, store })
    .run();

  const result = getPlanWithRecipes(id);
  res.status(201).json(result);
});

// GET /current — Get this week's plan with recipes
router.get("/current", (req, res) => {
  const householdId = req.user!.householdId;
  const weekStart = getCurrentWeekStart();

  const plan = db
    .select()
    .from(weeklyPlan)
    .where(
      and(eq(weeklyPlan.householdId, householdId), eq(weeklyPlan.weekStart, weekStart)),
    )
    .get();

  if (!plan) {
    res.status(404).json({ error: "No plan found for this week" });
    return;
  }

  res.json(getPlanWithRecipes(plan.id));
});

// GET /current/recommendations — Get AI-powered recipe recommendations
router.get("/current/recommendations", async (req, res) => {
  const householdId = req.user!.householdId;
  const weekStart = getCurrentWeekStart();

  try {
    const suggestions = await getRecommendations(householdId, weekStart);

    if (suggestions.length > 0) {
      res.json(suggestions);
      return;
    }
  } catch {
    // AI call failed — fall through to recency-based fallback
  }

  // Fallback: recency-based recommendations
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(
      and(eq(weeklyPlan.householdId, householdId), eq(weeklyPlan.weekStart, weekStart)),
    )
    .get();

  const excludeIds: string[] = [];
  if (plan) {
    const planRecipes = db
      .select({ recipeId: weeklyPlanRecipe.recipeId })
      .from(weeklyPlanRecipe)
      .where(eq(weeklyPlanRecipe.weeklyPlanId, plan.id))
      .all();
    excludeIds.push(...planRecipes.map((pr) => pr.recipeId));
  }

  let allRecipes = db
    .select()
    .from(recipe)
    .where(eq(recipe.householdId, householdId))
    .all();

  if (excludeIds.length > 0) {
    allRecipes = allRecipes.filter((r) => !excludeIds.includes(r.id));
  }

  allRecipes.sort((a, b) => {
    if (!a.lastCookedAt && b.lastCookedAt) return -1;
    if (a.lastCookedAt && !b.lastCookedAt) return 1;
    if (!a.lastCookedAt && !b.lastCookedAt) return 0;
    return a.lastCookedAt!.localeCompare(b.lastCookedAt!);
  });

  const fallback = allRecipes.slice(0, 6).map((r) => ({
    title: r.title,
    description: "",
    ingredients: [],
    discountMatches: [],
    isExisting: true,
    existingRecipeId: r.id,
  }));

  res.json(fallback);
});

// PATCH /:id — Update plan fields (status, store)
router.patch("/:id", (req, res) => {
  const householdId = req.user!.householdId;
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(and(eq(weeklyPlan.id, req.params.id), eq(weeklyPlan.householdId, householdId)))
    .get();

  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const updates: Record<string, any> = {};
  if (req.body.status) updates.status = req.body.status;
  if (req.body.store) updates.store = normalizeStore(req.body.store);

  if (Object.keys(updates).length > 0) {
    db.update(weeklyPlan).set(updates).where(eq(weeklyPlan.id, plan.id)).run();
  }

  res.json(getPlanWithRecipes(plan.id));
});

// POST /:id/recipes — Add a recipe to the plan
router.post("/:id/recipes", (req, res) => {
  const householdId = req.user!.householdId;
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(and(eq(weeklyPlan.id, req.params.id), eq(weeklyPlan.householdId, householdId)))
    .get();

  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const { recipeId, servings, day } = req.body;

  // Verify recipe belongs to household
  const r = db
    .select()
    .from(recipe)
    .where(and(eq(recipe.id, recipeId), eq(recipe.householdId, householdId)))
    .get();

  if (!r) { res.status(404).json({ error: "Recipe not found" }); return; }

  const dayIndex = day ? ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].indexOf(day) : null;

  db.insert(weeklyPlanRecipe)
    .values({
      id: crypto.randomUUID(),
      weeklyPlanId: plan.id,
      recipeId,
      servingsOverride: servings || null,
      dayOfWeek: dayIndex !== null && dayIndex >= 0 ? dayIndex : null,
    })
    .run();

  res.json(getPlanWithRecipes(plan.id));
});

// PATCH /:id/recipes/:recipeId — Update a recipe in the plan
router.patch("/:id/recipes/:recipeId", (req, res) => {
  const householdId = req.user!.householdId;
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(and(eq(weeklyPlan.id, req.params.id), eq(weeklyPlan.householdId, householdId)))
    .get();

  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const pr = db
    .select()
    .from(weeklyPlanRecipe)
    .where(
      and(
        eq(weeklyPlanRecipe.weeklyPlanId, plan.id),
        eq(weeklyPlanRecipe.recipeId, req.params.recipeId),
      ),
    )
    .get();

  if (!pr) { res.status(404).json({ error: "Recipe not in plan" }); return; }

  const updates: Record<string, any> = {};
  if (req.body.servings !== undefined) updates.servingsOverride = req.body.servings;
  if (req.body.day !== undefined) {
    const dayIndex = req.body.day ? ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].indexOf(req.body.day) : null;
    updates.dayOfWeek = dayIndex !== null && dayIndex >= 0 ? dayIndex : null;
  }

  if (Object.keys(updates).length > 0) {
    db.update(weeklyPlanRecipe).set(updates).where(eq(weeklyPlanRecipe.id, pr.id)).run();
  }

  res.json(getPlanWithRecipes(plan.id));
});

// DELETE /:id/recipes/:recipeId — Remove a recipe from the plan
router.delete("/:id/recipes/:recipeId", (req, res) => {
  const householdId = req.user!.householdId;
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(and(eq(weeklyPlan.id, req.params.id), eq(weeklyPlan.householdId, householdId)))
    .get();

  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  db.delete(weeklyPlanRecipe)
    .where(
      and(
        eq(weeklyPlanRecipe.weeklyPlanId, plan.id),
        eq(weeklyPlanRecipe.recipeId, req.params.recipeId),
      ),
    )
    .run();

  res.json(getPlanWithRecipes(plan.id));
});

// POST /:planId/generate-list — Generate grocery list from plan
router.post("/:planId/generate-list", async (req, res) => {
  const householdId = req.user!.householdId;
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(and(eq(weeklyPlan.id, req.params.planId), eq(weeklyPlan.householdId, householdId)))
    .get();

  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  // Update store if provided
  if (req.body.store) {
    db.update(weeklyPlan)
      .set({ store: normalizeStore(req.body.store) })
      .where(eq(weeklyPlan.id, plan.id))
      .run();
  }

  try {
    const list = generateGroceryList(plan.id, householdId);
    res.status(201).json(list);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to generate list: ${err.message}` });
  }
});

export default router;
