import {Router} from "express";
import {db} from "../db/connection.js";
import {groceryItem, groceryList, recipe, weeklyPlan, weeklyPlanRecipe,} from "../db/schema.js";
import {and, desc, eq} from "drizzle-orm";
import {requireAuth} from "../middleware/auth.js";
import {generateGroceryList} from "../services/lists.js";
import {addRecipeToPlanSchema, validate} from "../validation/schemas.js";
import {getCachedSuggestions, getSuggestions, refreshCachedSuggestions} from "../services/suggestions.js";
import {aiRateLimiter} from "../middleware/ai-rate-limit.js";
import {posthog} from "../posthog.js";

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

function getWeekNumber(weekStart: string): number {
  const date = new Date(weekStart);
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  return Math.ceil((days + jan1.getDay() + 1) / 7);
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
    displayName: plan.name || `Week ${getWeekNumber(plan.weekStart)}`,
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

// GET / — List all plans for the household
router.get("/", (req, res) => {
  const householdId = req.user!.householdId;

  const plans = db
    .select()
    .from(weeklyPlan)
    .where(eq(weeklyPlan.householdId, householdId))
    .orderBy(desc(weeklyPlan.weekStart))
    .all();

  const result = plans.map((p) => ({
    id: p.id,
    weekStart: p.weekStart,
    name: p.name,
    displayName: p.name || `Week ${getWeekNumber(p.weekStart)}`,
    store: p.store,
    status: p.status,
    createdAt: p.createdAt,
  }));

  res.json(result);
});

// POST / — Create a weekly plan (one per week)
router.post("/", (req, res) => {
  const householdId = req.user!.householdId;
  const weekStart = req.body.weekStart || getCurrentWeekStart();

  // Check if a plan for this week already exists
  const existing = db
    .select()
    .from(weeklyPlan)
    .where(
      and(eq(weeklyPlan.householdId, householdId), eq(weeklyPlan.weekStart, weekStart)),
    )
    .get();

  if (existing) {
    res.json(getPlanWithRecipes(existing.id));
    return;
  }

  const store = req.body.store ? normalizeStore(req.body.store) : "albert_heijn";

  const id = crypto.randomUUID();
  db.insert(weeklyPlan)
    .values({ id, householdId, weekStart, store })
    .run();

  posthog.capture({
    distinctId: req.user!.userId,
    event: "plan created",
    properties: { plan_id: id, week_start: weekStart, store },
  });
  const result = getPlanWithRecipes(id);
  res.status(201).json(result);
});

// GET /current — Get the most recent plan
router.get("/current", (req, res) => {
  const householdId = req.user!.householdId;
  const weekStart = getCurrentWeekStart();

  // Try current week first
  let plan = db
    .select()
    .from(weeklyPlan)
    .where(
      and(eq(weeklyPlan.householdId, householdId), eq(weeklyPlan.weekStart, weekStart)),
    )
    .get();

  // Fallback: most recent plan
  if (!plan) {
    plan = db
      .select()
      .from(weeklyPlan)
      .where(eq(weeklyPlan.householdId, householdId))
      .orderBy(desc(weeklyPlan.weekStart))
      .get();
  }

  if (!plan) {
    res.status(404).json({ error: "No plan found" });
    return;
  }

  res.json(getPlanWithRecipes(plan.id));
});

// GET /current/suggestions — Get cached recipe suggestions
router.get("/current/suggestions", aiRateLimiter, async (req, res) => {
  const householdId = req.user!.householdId;

  // Return cached suggestions
  const cached = getCachedSuggestions(householdId);
  if (cached.length > 0) {
    res.json(cached);
    return;
  }

  // No cache — generate live
  try {
    const suggestions = await getSuggestions(householdId, [], req.user!.userId);
    if (suggestions.length > 0) {
      res.json(suggestions);
      return;
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: recency-based own recipes
  const allRecipes = db
    .select()
    .from(recipe)
    .where(eq(recipe.householdId, householdId))
    .all();

  allRecipes.sort((a, b) => {
    if (!a.lastCookedAt && b.lastCookedAt) return -1;
    if (a.lastCookedAt && !b.lastCookedAt) return 1;
    if (!a.lastCookedAt && !b.lastCookedAt) return 0;
    return a.lastCookedAt!.localeCompare(b.lastCookedAt!);
  });

  const fallback = allRecipes.slice(0, 5).map((r) => ({
    title: r.title,
    description: "",
    ingredients: [],
    discountMatches: [],
    isExisting: true,
    existingRecipeId: r.id,
    source: "eigen" as const,
  }));

  res.json(fallback);
});

// POST /current/suggestions/refresh — Regenerate all suggestions
router.post("/current/suggestions/refresh", aiRateLimiter, async (req, res) => {
  const householdId = req.user!.householdId;

  try {
    await refreshCachedSuggestions(householdId);
    const suggestions = getCachedSuggestions(householdId);
    res.json(suggestions);
  } catch (err) {
    console.error("Failed to refresh suggestions:", err);
    res.status(500).json({ error: "Failed to refresh suggestions" });
  }
});

// POST /current/suggestions/more — Load additional suggestions (excluding already shown)
router.post("/current/suggestions/more", aiRateLimiter, async (req, res) => {
  const householdId = req.user!.householdId;
  const exclude: string[] = req.body.exclude || [];

  try {
    const suggestions = await getSuggestions(householdId, exclude, req.user!.userId);
    res.json(suggestions);
  } catch (err) {
    console.error("Failed to load more suggestions:", err);
    res.status(500).json({ error: "Failed to load more suggestions" });
  }
});

// GET /:id — Get a specific plan with recipes
router.get("/:id", (req, res) => {
  const householdId = req.user!.householdId;
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(and(eq(weeklyPlan.id, req.params.id), eq(weeklyPlan.householdId, householdId)))
    .get();

  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  res.json(getPlanWithRecipes(plan.id));
});

// PATCH /:id — Update plan fields (status, store, name)
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
  if (req.body.name !== undefined) updates.name = req.body.name || null;
  if (req.body.weekStart) updates.weekStart = req.body.weekStart;

  if (Object.keys(updates).length > 0) {
    db.update(weeklyPlan).set(updates).where(eq(weeklyPlan.id, plan.id)).run();
  }

  res.json(getPlanWithRecipes(plan.id));
});

// DELETE /:id — Delete a plan and its recipe links
router.delete("/:id", (req, res) => {
  const householdId = req.user!.householdId;
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(and(eq(weeklyPlan.id, req.params.id), eq(weeklyPlan.householdId, householdId)))
    .get();

  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  db.delete(weeklyPlanRecipe)
    .where(eq(weeklyPlanRecipe.weeklyPlanId, plan.id))
    .run();
  db.delete(weeklyPlan)
    .where(eq(weeklyPlan.id, plan.id))
    .run();

  res.json({ ok: true });
});

// POST /:id/recipes — Add a recipe to the plan
router.post("/:id/recipes", validate(addRecipeToPlanSchema), (req: any, res: any) => {
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

  posthog.capture({
    distinctId: req.user!.userId,
    event: "recipe added to plan",
    properties: {
      plan_id: plan.id,
      recipe_id: recipeId,
      recipe_title: r.title,
      day,
      servings: servings || r.servings,
    },
  });
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

  // Remove recipe's ingredients from the grocery list (if one exists)
  const list = db
    .select()
    .from(groceryList)
    .where(eq(groceryList.weeklyPlanId, plan.id))
    .get();

  if (list) {
    db.delete(groceryItem)
      .where(
        and(
          eq(groceryItem.groceryListId, list.id),
          eq(groceryItem.sourceRecipeId, req.params.recipeId),
        ),
      )
      .run();
  }

  db.delete(weeklyPlanRecipe)
    .where(
      and(
        eq(weeklyPlanRecipe.weeklyPlanId, plan.id),
        eq(weeklyPlanRecipe.recipeId, req.params.recipeId),
      ),
    )
    .run();

  posthog.capture({
    distinctId: req.user!.userId,
    event: "recipe removed from plan",
    properties: { plan_id: plan.id, recipe_id: req.params.recipeId },
  });
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
    posthog.capture({
      distinctId: req.user!.userId,
      event: "grocery list generated",
      properties: {
        plan_id: plan.id,
        list_id: list.id,
        store: plan.store,
        item_count: list.items?.length ?? 0,
      },
    });
    res.status(201).json(list);
  } catch (err: any) {
    posthog.captureException(err, req.user!.userId, { plan_id: plan.id });
    res.status(500).json({ error: `Failed to generate list: ${err.message}` });
  }
});

export default router;
