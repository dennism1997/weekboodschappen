import {Router} from "express";
import {db} from "../db/connection.js";
import {groceryItem, recipe, weeklyPlanRecipe} from "../db/schema.js";
import {and, eq, like} from "drizzle-orm";
import {requireAuth} from "../middleware/auth.js";
import {scrapeRecipe} from "../services/ai-scraper.js";
import {categorizeBatchWithAI} from "../services/ai.js";
import {categorizeIngredientSync} from "../utils/categories.js";
import {scrapeRecipeSchema, validate} from "../validation/schemas.js";
import {aiRateLimiter} from "../middleware/ai-rate-limit.js";
import {posthog} from "../posthog.js";

const router = Router();
router.use(requireAuth);

router.post("/scrape", aiRateLimiter, validate(scrapeRecipeSchema), async (req, res) => {
  const { url } = req.body;

  try {
    const scraped = await scrapeRecipe(url, req.user!.userId);

    // Find ingredients that couldn't be categorized statically
    const unknowns = scraped.ingredients
      .filter((i) => categorizeIngredientSync(i.name) === null)
      .map((i) => i.name);

    // Use AI to categorize unknowns
    if (unknowns.length > 0) {
      try {
        const aiCategories = await categorizeBatchWithAI(unknowns, req.user!.userId);
        for (const ing of scraped.ingredients) {
          if (categorizeIngredientSync(ing.name) === null && aiCategories[ing.name]) {
            ing.category = aiCategories[ing.name];
          }
        }
      } catch {
        // AI categorization failed — ingredients stay as "Overig"
      }
    }

    // Remove heading-only steps (e.g. "**Bereiding**", "**Voor de saus**")
    let stepNum = 1;
    const cleanedInstructions = scraped.instructions
      .filter((s) => !(/^\*\*[^*]+\*\*$/.test(s.text.trim())))
      .map((s) => ({ step: stepNum++, text: s.text }));

    // Save to database
    const id = crypto.randomUUID();
    db.insert(recipe)
      .values({
        id,
        householdId: req.user!.householdId,
        title: scraped.title,
        sourceUrl: scraped.sourceUrl,
        imageUrl: scraped.imageUrl,
        servings: scraped.servings,
        prepTimeMinutes: scraped.prepTimeMinutes,
        cookTimeMinutes: scraped.cookTimeMinutes,
        ingredients: scraped.ingredients,
        instructions: cleanedInstructions,
        tags: [],
      })
      .run();

    const saved = db.select().from(recipe).where(eq(recipe.id, id)).get();
    posthog.capture({
      distinctId: req.user!.userId,
      event: "recipe scraped",
      properties: {
        recipe_id: id,
        recipe_title: scraped.title,
        source_url: scraped.sourceUrl,
        ingredient_count: scraped.ingredients.length,
      },
    });
    res.json(saved);
  } catch (err: any) {
    posthog.captureException(err, req.user!.userId, { url: req.body.url });
    res.status(422).json({ error: `Failed to scrape recipe: ${err.message}` });
  }
});

router.post("/from-suggestion", aiRateLimiter, async (req, res) => {
  const { title, description, ingredients, recipeUrl } = req.body;

  if (!title || !ingredients || !Array.isArray(ingredients)) {
    res.status(400).json({ error: "title and ingredients array are required" });
    return;
  }

  // If we have a URL, scrape the full recipe (includes instructions, image, etc.)
  if (recipeUrl) {
    try {
      const scraped = await scrapeRecipe(recipeUrl, req.user!.userId);
      let stepNum = 1;
      const cleanedInstructions = scraped.instructions
        .filter((s) => !(/^\*\*[^*]+\*\*$/.test(s.text.trim())))
        .map((s) => ({ step: stepNum++, text: s.text }));

      const id = crypto.randomUUID();
      db.insert(recipe)
        .values({
          id,
          householdId: req.user!.householdId,
          title: scraped.title,
          sourceUrl: scraped.sourceUrl,
          imageUrl: scraped.imageUrl,
          servings: scraped.servings,
          prepTimeMinutes: scraped.prepTimeMinutes,
          cookTimeMinutes: scraped.cookTimeMinutes,
          ingredients: scraped.ingredients,
          instructions: cleanedInstructions,
          tags: [],
        })
        .run();

      const saved = db.select().from(recipe).where(eq(recipe.id, id)).get();
      posthog.capture({
        distinctId: req.user!.userId,
        event: "recipe added from suggestion",
        properties: {
          recipe_id: id,
          recipe_title: scraped.title,
          source: "scrape",
          has_url: true,
        },
      });
      res.json(saved);
      return;
    } catch (err: any) {
      posthog.captureException(err, req.user!.userId, { recipe_url: recipeUrl });
      res.status(422).json({ error: `Failed to scrape recipe: ${err.message}` });
      return;
    }
  }

  // Fallback: save from suggestion data without full scrape
  const unknowns: string[] = [];
  const categorized: { name: string; quantity: number; unit: string; category: string }[] = [];

  for (const name of ingredients) {
    const category = categorizeIngredientSync(name);
    if (category) {
      categorized.push({ name, quantity: 1, unit: "stuk", category });
    } else {
      unknowns.push(name);
      categorized.push({ name, quantity: 1, unit: "stuk", category: "Overig" });
    }
  }

  if (unknowns.length > 0) {
    try {
      const aiCategories = await categorizeBatchWithAI(unknowns, req.user!.userId);
      for (const ing of categorized) {
        if (ing.category === "Overig" && aiCategories[ing.name]) {
          ing.category = aiCategories[ing.name];
        }
      }
    } catch {
      // Keep "Overig" fallback
    }
  }

  const id = crypto.randomUUID();
  db.insert(recipe)
    .values({
      id,
      householdId: req.user!.householdId,
      title,
      servings: 4,
      ingredients: categorized,
      instructions: [],
      tags: description ? [description] : [],
    })
    .run();

  const saved = db.select().from(recipe).where(eq(recipe.id, id)).get();
  posthog.capture({
    distinctId: req.user!.userId,
    event: "recipe added from suggestion",
    properties: {
      recipe_id: id,
      recipe_title: title,
      source: "suggestion_data",
      has_url: false,
    },
  });
  res.json(saved);
});

router.get("/", (req, res) => {
  const search = req.query.search as string | undefined;
  const householdId = req.user!.householdId;

  let query = db
    .select()
    .from(recipe)
    .where(
      search
        ? and(
            eq(recipe.householdId, householdId),
            like(recipe.title, `%${search}%`),
          )
        : eq(recipe.householdId, householdId),
    );

  const results = query.all();
  res.json(results);
});

router.get("/:id", (req, res) => {
  const found = db
    .select()
    .from(recipe)
    .where(
      and(
        eq(recipe.id, req.params.id),
        eq(recipe.householdId, req.user!.householdId),
      ),
    )
    .get();

  if (!found) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  res.json(found);
});

router.put("/:id", (req, res) => {
  const { title, ingredients, instructions, tags, servings } = req.body;

  const existing = db
    .select()
    .from(recipe)
    .where(
      and(
        eq(recipe.id, req.params.id),
        eq(recipe.householdId, req.user!.householdId),
      ),
    )
    .get();

  if (!existing) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  db.update(recipe)
    .set({
      ...(title !== undefined && { title }),
      ...(ingredients !== undefined && { ingredients }),
      ...(instructions !== undefined && { instructions }),
      ...(tags !== undefined && { tags }),
      ...(servings !== undefined && { servings }),
    })
    .where(eq(recipe.id, req.params.id))
    .run();

  const updated = db.select().from(recipe).where(eq(recipe.id, req.params.id)).get();
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const existing = db
    .select()
    .from(recipe)
    .where(
      and(
        eq(recipe.id, req.params.id),
        eq(recipe.householdId, req.user!.householdId),
      ),
    )
    .get();

  if (!existing) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  // Clear foreign key references before deleting
  db.update(groceryItem).set({ sourceRecipeId: null }).where(eq(groceryItem.sourceRecipeId, req.params.id)).run();
  db.delete(weeklyPlanRecipe).where(eq(weeklyPlanRecipe.recipeId, req.params.id)).run();
  db.delete(recipe).where(eq(recipe.id, req.params.id)).run();
  posthog.capture({
    distinctId: req.user!.userId,
    event: "recipe deleted",
    properties: { recipe_id: existing.id, recipe_title: existing.title },
  });
  res.json({ ok: true });
});

// POST /categorize — Categorize ingredient names
router.post("/categorize", aiRateLimiter, async (req, res) => {
  const { ingredients } = req.body;
  if (!ingredients || !Array.isArray(ingredients)) {
    res.status(400).json({ error: "ingredients array is required" });
    return;
  }

  const result: Record<string, string> = {};
  const unknowns: string[] = [];

  for (const name of ingredients) {
    const category = categorizeIngredientSync(name);
    if (category) {
      result[name] = category;
    } else {
      unknowns.push(name);
    }
  }

  // Use AI for unknowns
  if (unknowns.length > 0) {
    try {
      const aiResult = await categorizeBatchWithAI(unknowns, req.user!.userId);
      Object.assign(result, aiResult);
    } catch {
      for (const name of unknowns) {
        result[name] = "Overig";
      }
    }
  }

  res.json(result);
});

export default router;
