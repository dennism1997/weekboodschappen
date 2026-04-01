import {db} from "../db/connection.js";
import {cachedSuggestion, favoriteWebsite, productDiscount, recipe,} from "../db/schema.js";
import {and, eq, gte, lte} from "drizzle-orm";
import {member} from "../db/auth-schema.js";
import {getRecipeRating, type ScrapedRecipeListing, scrapeRecipeListings,} from "./website-scraper.js";
import {scrapeRecipe} from "./scraper.js";

export interface Suggestion {
  title: string;
  description: string;
  ingredients: string[];
  discountMatches: string[];
  isExisting: boolean;
  existingRecipeId?: string;
  recipeUrl?: string;
  rating?: number;
  source: "eigen" | "website";
}

interface Discount {
  productName: string;
  store: string;
  discountPercentage: number;
  salePrice: number;
}

function getCurrentDiscounts(): Discount[] {
  const today = new Date().toISOString().split("T")[0];
  return db
    .select({
      productName: productDiscount.productName,
      store: productDiscount.store,
      discountPercentage: productDiscount.discountPercentage,
      salePrice: productDiscount.salePrice,
    })
    .from(productDiscount)
    .where(
      and(
        lte(productDiscount.validFrom, today),
        gte(productDiscount.validUntil, today),
      ),
    )
    .all();
}

/**
 * Get 2 suggestions from own recipe library, preferring discount matches.
 */
function getOwnRecipeSuggestions(
  householdId: string,
  discounts: Discount[],
  exclude: string[] = [],
): Suggestion[] {
  const excludeSet = new Set(exclude.map((t) => t.toLowerCase()));

  let allRecipes = db
    .select()
    .from(recipe)
    .where(eq(recipe.householdId, householdId))
    .all();

  // Filter out already-shown recipes
  allRecipes = allRecipes.filter((r) => !excludeSet.has(r.title.toLowerCase()));

  if (allRecipes.length === 0) return [];

  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  const eightWeeksAgoStr = eightWeeksAgo.toISOString().split("T")[0];

  // Score each recipe by discount matches + recency
  const scored = allRecipes.map((r) => {
    let score = 0;
    const matchedDiscounts: string[] = [];

    const ingredients = (r.ingredients as { name: string }[]) || [];
    for (const ing of ingredients) {
      for (const d of discounts) {
        const ingName = (ing.name || "").toLowerCase();
        const dName = d.productName.toLowerCase();
        if (ingName.includes(dName) || dName.includes(ingName)) {
          score += d.discountPercentage;
          matchedDiscounts.push(d.productName);
        }
      }
    }

    // Penalize recently cooked recipes
    if (r.lastCookedAt && r.lastCookedAt >= eightWeeksAgoStr) {
      score -= 50;
    }

    // Small bonus for never-cooked recipes
    if (!r.lastCookedAt) {
      score += 10;
    }

    return {
      recipe: r,
      score,
      matchedDiscounts: [...new Set(matchedDiscounts)],
    };
  });

  // Shuffle with Fisher-Yates, then stable-sort by score so same-score items are randomized
  for (let i = scored.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [scored[i], scored[j]] = [scored[j], scored[i]];
  }
  scored.sort((a, b) => b.score - a.score);

  // Pick up to 5 with different first ingredients
  const picks: (typeof scored)[number][] = [];
  const usedMainIngredients = new Set<string>();

  for (const item of scored) {
    if (picks.length >= 5) break;
    const ingredients = (item.recipe.ingredients as { name: string }[]) || [];
    const mainIngredient = ingredients[0]?.name?.toLowerCase() || "";

    if (usedMainIngredients.has(mainIngredient) && mainIngredient) continue;

    picks.push(item);
    if (mainIngredient) usedMainIngredients.add(mainIngredient);
  }

  return picks.map((p) => ({
    title: p.recipe.title,
    description: "",
    ingredients: ((p.recipe.ingredients as { name: string }[]) || []).map(
      (i) => i.name,
    ),
    discountMatches: p.matchedDiscounts,
    isExisting: true,
    existingRecipeId: p.recipe.id,
    recipeUrl: p.recipe.sourceUrl || undefined,
    source: "eigen" as const,
  }));
}

/**
 * Scrape favorite websites and return recipes directly (no AI).
 * Matches discount keywords against recipe titles and fetches ratings.
 */
async function getWebsiteSuggestions(
  householdId: string,
  discounts: Discount[],
  excludeTitles: string[],
): Promise<Suggestion[]> {
  // 1. Get favorite websites
  const websites = db
    .select()
    .from(favoriteWebsite)
    .where(eq(favoriteWebsite.householdId, householdId))
    .all();

  if (websites.length === 0) return [];

  // 2. Scrape recipe listings from each website (in parallel)
  const listingScrapeResults = await Promise.allSettled(
    websites.map((w) => scrapeRecipeListings(w.url)),
  );
  const allListings: ScrapedRecipeListing[] = [];
  for (const result of listingScrapeResults) {
    if (result.status === "fulfilled") {
      allListings.push(...result.value);
    }
  }

  if (allListings.length === 0) {
    console.log("No recipe listings scraped from any website");
    return [];
  }

  console.log(`Scraped ${allListings.length} recipe listings from ${websites.length} website(s)`);

  // 3. Filter out excluded titles
  const excludeSet = new Set(excludeTitles.map((t) => t.toLowerCase()));
  const filtered = allListings.filter(
    (l) => !excludeSet.has(l.title.toLowerCase()),
  );

  // 4. Match discounts against recipe titles and score
  const scored = filtered.map((listing) => {
    const titleLower = listing.title.toLowerCase();
    const matchedDiscounts: string[] = [];
    for (const d of discounts) {
      if (titleLower.includes(d.productName.toLowerCase())) {
        matchedDiscounts.push(d.productName);
      }
    }
    return { listing, matchedDiscounts, score: matchedDiscounts.length };
  });

  // Shuffle then sort by score (randomizes same-score items)
  for (let i = scored.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [scored[i], scored[j]] = [scored[j], scored[i]];
  }
  scored.sort((a, b) => b.score - a.score);

  // 5. Take top candidates and scrape full recipe details + ratings
  const candidates = scored.slice(0, 10);
  const [scrapeResults, ratingResults] = await Promise.all([
    Promise.allSettled(candidates.map((c) => scrapeRecipe(c.listing.url))),
    Promise.allSettled(candidates.map((c) => getRecipeRating(c.listing.url))),
  ]);

  const suggestions: Suggestion[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (suggestions.length >= 5) break;

    const { listing, matchedDiscounts } = candidates[i];

    const ratingResult = ratingResults[i];
    const ratingData =
      ratingResult.status === "fulfilled" ? ratingResult.value : null;

    // Filter out recipes with rating below 3
    if (ratingData && ratingData.value < 3) {
      console.log(`Skipping ${listing.title}: rating ${ratingData.value} < 3`);
      continue;
    }

    const scrapeResult = scrapeResults[i];
    const recipeData =
      scrapeResult.status === "fulfilled" ? scrapeResult.value : null;

    if (!recipeData) {
      console.log(`Skipping ${listing.title}: failed to scrape recipe details`);
      continue;
    }

    suggestions.push({
      title: recipeData.title,
      description: "",
      ingredients: recipeData.ingredients.map((ing) => ing.name),
      discountMatches: [...new Set(matchedDiscounts)],
      isExisting: false,
      recipeUrl: listing.url,
      rating: ratingData?.value,
      source: "website",
    });
  }

  return suggestions;
}

/**
 * Get 5 recommendations: 2 from own recipes + 3 from websites.
 * Pass exclude to skip already-shown titles.
 */
export async function getRecommendations(
  householdId: string,
  exclude: string[] = [],
): Promise<Suggestion[]> {
  const discounts = getCurrentDiscounts();

  // 1. Get own recipe suggestions (fast, no AI)
  const ownSuggestions = getOwnRecipeSuggestions(householdId, discounts, exclude);
  console.log(`Generated ${ownSuggestions.length} own recipe suggestions`);

  // 2. Get website suggestions (scraping + rating)
  const allExclude = [...exclude, ...ownSuggestions.map((s) => s.title)];
  const websiteSuggestions = await getWebsiteSuggestions(
    householdId,
    discounts,
    allExclude,
  );
  console.log(`Generated ${websiteSuggestions.length} website suggestions`);

  return [...ownSuggestions, ...websiteSuggestions];
}

/**
 * Get cached suggestions for a household.
 */
export function getCachedSuggestions(householdId: string): Suggestion[] {
  const cached = db
    .select()
    .from(cachedSuggestion)
    .where(eq(cachedSuggestion.householdId, householdId))
    .all();

  return cached.map((c) => c.data as Suggestion);
}

/**
 * Pre-generate and cache suggestions for a household.
 */
export async function refreshCachedSuggestions(
  householdId: string,
): Promise<void> {
  try {
    const suggestions = await getRecommendations(householdId);

    // Clear old cached suggestions
    db.delete(cachedSuggestion)
      .where(eq(cachedSuggestion.householdId, householdId))
      .run();

    // Insert new ones
    for (const s of suggestions) {
      db.insert(cachedSuggestion)
        .values({
          id: crypto.randomUUID(),
          householdId,
          data: s,
        })
        .run();
    }

    console.log(
      `Cached ${suggestions.length} suggestions for household ${householdId}`,
    );
  } catch (err) {
    console.error(
      `Failed to cache suggestions for household ${householdId}:`,
      err,
    );
  }
}

/**
 * Pre-generate suggestions for all households.
 */
export async function refreshAllCachedSuggestions(): Promise<void> {
  const households = db
    .select({ organizationId: member.organizationId })
    .from(member)
    .all();

  const uniqueIds = [...new Set(households.map((h) => h.organizationId))];

  for (const householdId of uniqueIds) {
    await refreshCachedSuggestions(householdId);
  }
}
