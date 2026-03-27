# Suggestion Action Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "toevoegen aan plan" and "opslaan in recepten" buttons to every suggestion card in the MealPlanner.

**Architecture:** New server endpoint `POST /recipes/from-suggestion` creates a recipe from AI suggestion data (no scraping). Client gets two buttons per suggestion card, with local state tracking which suggestions have been saved as recipes.

**Tech Stack:** Express, Drizzle ORM, React, TanStack React Query, Lucide React icons

**Spec:** `docs/superpowers/specs/2026-03-27-suggestion-action-buttons-design.md`

---

### Task 1: Server endpoint — `POST /recipes/from-suggestion`

**Files:**
- Modify: `packages/server/src/routes/recipes.ts` (add new route before the `GET /` route)

- [ ] **Step 1: Add the route**

In `packages/server/src/routes/recipes.ts`, add this route after the existing `router.post("/scrape", ...)` block (after line 62) and before the `router.get("/", ...)` block:

```typescript
router.post("/from-suggestion", async (req, res) => {
  const { title, description, ingredients } = req.body;

  if (!title || !ingredients || !Array.isArray(ingredients)) {
    res.status(400).json({ error: "title and ingredients array are required" });
    return;
  }

  // Categorize each ingredient name
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

  // AI categorization for unknowns
  if (unknowns.length > 0) {
    try {
      const aiCategories = await categorizeBatchWithAI(unknowns);
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
  res.json(saved);
});
```

- [ ] **Step 2: Verify the server compiles**

Run: `cd /Users/dennis/Personal/weekboodschappen && pnpm run typecheck`
Expected: No errors in `packages/server/`

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/recipes.ts
git commit -m "feat: add POST /recipes/from-suggestion endpoint"
```

---

### Task 2: Client — add buttons and state to suggestion cards

**Files:**
- Modify: `packages/client/src/pages/MealPlanner.tsx`

- [ ] **Step 1: Add Lucide import and state**

At the top of `MealPlanner.tsx`, add the Lucide import:

```typescript
import { Bookmark } from "lucide-react";
```

Inside the `MealPlanner` component, after the existing `useState` declarations (around line 66), add:

```typescript
// Track which suggestions have been saved as recipes (index → recipeId)
const [savedSuggestions, setSavedSuggestions] = useState<Record<number, string>>({});
```

- [ ] **Step 2: Add `saveSuggestionAsRecipe` function**

After the existing `addSuggestionToPlan` function (after line 145), add:

```typescript
const saveSuggestionAsRecipe = async (rec: Suggestion): Promise<string | null> => {
  try {
    const created = await apiFetch<{ id: string }>("/recipes/from-suggestion", {
      method: "POST",
      body: JSON.stringify({
        title: rec.title,
        description: rec.description,
        ingredients: rec.ingredients,
      }),
    });
    return created.id;
  } catch {
    return null;
  }
};
```

- [ ] **Step 3: Update `addSuggestionToPlan` to handle new recipes**

Replace the existing `addSuggestionToPlan` function (lines 141-145) with:

```typescript
const addSuggestionToPlan = async (rec: Suggestion, index: number) => {
  if (!plan) return;
  let recipeId: string | undefined;

  if (rec.isExisting && rec.existingRecipeId) {
    recipeId = rec.existingRecipeId;
  } else if (savedSuggestions[index]) {
    recipeId = savedSuggestions[index];
  } else {
    const newId = await saveSuggestionAsRecipe(rec);
    if (!newId) return;
    recipeId = newId;
    setSavedSuggestions((prev) => ({ ...prev, [index]: newId }));
  }

  await addRecipeToPlan({ id: recipeId, title: rec.title, servings: 4 });
};
```

- [ ] **Step 4: Add `saveToRecipes` handler**

After `addSuggestionToPlan`, add:

```typescript
const saveToRecipes = async (rec: Suggestion, index: number) => {
  const newId = await saveSuggestionAsRecipe(rec);
  if (newId) {
    setSavedSuggestions((prev) => ({ ...prev, [index]: newId }));
    await invalidateSuggestions();
  }
};
```

- [ ] **Step 5: Update suggestion card UI (when plan exists)**

Replace the suggestion card JSX inside the `{plan && recommendations.length > 0}` block (lines 410-440). Replace the `recommendations.map` callback with:

```tsx
{recommendations.map((rec, i) => {
  const isSaved = rec.isExisting || !!savedSuggestions[i];
  const alreadyInPlan = plan.recipes.some(
    (r) => r.recipeId === rec.existingRecipeId || r.recipeId === savedSuggestions[i]
  );

  return (
    <div key={i} className="rounded-[12px] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
          {rec.description && (
            <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
          )}
          {rec.discountMatches.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {rec.discountMatches.map((d, j) => (
                <span key={j} className="rounded-[4px] bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">
                  korting: {d}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => saveToRecipes(rec, i)}
            disabled={isSaved}
            className={`rounded-[8px] p-1.5 ${
              isSaved
                ? "bg-accent text-white"
                : "bg-ios-grouped-bg text-ios-secondary"
            }`}
            title={isSaved ? "Opgeslagen in recepten" : "Opslaan in recepten"}
          >
            <Bookmark className="h-4 w-4" fill={isSaved ? "currentColor" : "none"} />
          </button>
          {!alreadyInPlan && (
            <button
              onClick={() => addSuggestionToPlan(rec, i)}
              className="rounded-[8px] bg-accent px-3 py-1.5 text-[13px] font-semibold text-white"
            >
              + Plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
})}
```

- [ ] **Step 6: Update suggestion card UI (when no plan exists)**

Replace the suggestion cards in the `{!plan}` section (lines 254-269) with the same bookmark button pattern, but without the "+ Plan" button (since there's no plan to add to):

```tsx
{recommendations.map((rec, i) => {
  const isSaved = rec.isExisting || !!savedSuggestions[i];

  return (
    <div key={i} className="rounded-[12px] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
          {rec.description && (
            <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
          )}
          {rec.discountMatches.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {rec.discountMatches.map((d, j) => (
                <span key={j} className="rounded-[4px] bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">
                  korting: {d}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => saveToRecipes(rec, i)}
          disabled={isSaved}
          className={`shrink-0 rounded-[8px] p-1.5 ${
            isSaved
              ? "bg-accent text-white"
              : "bg-ios-grouped-bg text-ios-secondary"
          }`}
          title={isSaved ? "Opgeslagen in recepten" : "Opslaan in recepten"}
        >
          <Bookmark className="h-4 w-4" fill={isSaved ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
})}
```

- [ ] **Step 7: Verify client compiles**

Run: `cd /Users/dennis/Personal/weekboodschappen && pnpm run typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/MealPlanner.tsx
git commit -m "feat: add plan and recipe buttons to suggestion cards"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev server**

Run: `cd /Users/dennis/Personal/weekboodschappen && pnpm dev`

- [ ] **Step 2: Test in browser**

1. Open the Plan tab
2. Verify suggestions show two buttons: bookmark icon + "+ Plan"
3. Click bookmark on a new suggestion → icon becomes filled/accent
4. Click "+ Plan" on a new suggestion → recipe gets created and added to plan
5. Click "+ Plan" on an existing suggestion → added directly to plan
6. Suggestions already in the recipe library show filled bookmark
7. Recipes already in the plan don't show "+ Plan" button
