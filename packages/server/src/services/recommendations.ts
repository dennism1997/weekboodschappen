import Anthropic from "@anthropic-ai/sdk";
import {db} from "../db/connection.js";
import {cachedSuggestion, favoriteWebsite, productDiscount, recipe,} from "../db/schema.js";
import {and, eq, gte, lte} from "drizzle-orm";
import {member} from "../db/auth-schema.js";
import {getRecipeRating, type ScrapedRecipeListing, scrapeRecipeListings,} from "./website-scraper.js";

const client = new Anthropic();

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

function getSeason(date: Date): string {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return "lente";
  if (month >= 6 && month <= 8) return "zomer";
  if (month >= 9 && month <= 11) return "herfst";
  return "winter";
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

  scored.sort((a, b) => b.score - a.score);

  // Pick top 2 with different first ingredients (proxy for main ingredient)
  const picks: (typeof scored)[number][] = [];
  const usedMainIngredients = new Set<string>();

  for (const item of scored) {
    if (picks.length >= 2) break;
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
 * Scrape favorite websites and use Claude to pick 3 real recipes.
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
  const scrapeResults = await Promise.allSettled(
    websites.map((w) => scrapeRecipeListings(w.url)),
  );
  const allListings: ScrapedRecipeListing[] = [];
  for (const result of scrapeResults) {
    if (result.status === "fulfilled") {
      allListings.push(...result.value);
    }
  }

  if (allListings.length === 0) {
    console.log("No recipe listings scraped from any website");
    return [];
  }

  console.log(`Scraped ${allListings.length} recipe listings from ${websites.length} website(s)`);

  // 3. Use Claude to pick 3 main courses from the scraped list
  const season = getSeason(new Date());
  const discountSection =
    discounts.length > 0
      ? `\nHuidige aanbiedingen:\n${discounts.map((d) => `- ${d.productName} (${d.store}, ${d.discountPercentage}% korting)`).join("\n")}\n`
      : "\nGeen aanbiedingen beschikbaar.\n";

  const listingsSection = allListings
    .map((l, i) => `${i + 1}. "${l.title}" — ${l.url}`)
    .join("\n");

  const prompt = `Je bent een Nederlandse maaltijdplanner. Kies 3 HOOFDGERECHTEN uit de onderstaande lijst van echte recepten.

Beschikbare recepten van favoriete websites:
${listingsSection}
${discountSection}
Context:
- Seizoen: ${season}
- Al gekozen/getoonde recepten (NIET opnieuw kiezen): ${excludeTitles.join(", ") || "geen"}

Regels:
- Kies ALLEEN recepten uit de bovenstaande lijst — verzin GEEN nieuwe recepten of URLs.
- Kies ALLEEN hoofdgerechten (geen bijgerechten, voorgerechten, desserts, snacks, koekjes, taarten, ontbijt).
- Maximaal 2 recepten met hetzelfde hoofdingrediënt (bijv. max 2x kip, max 2x gehakt).
- Geef voorkeur aan recepten die passen bij de huidige aanbiedingen.
- Kies recepten die NIET in de lijst van al gekozen/getoonde recepten staan.
- Houd rekening met het seizoen (${season}).

Antwoord ALLEEN met geldige JSON:
[
  {
    "title": "Exacte titel uit de lijst",
    "url": "Exacte URL uit de lijst",
    "description": "Korte beschrijving (1-2 zinnen)",
    "ingredients": ["ingrediënt1", "ingrediënt2"],
    "discountMatches": ["product in aanbieding dat past bij dit recept"]
  }
]`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*]/);
    if (!jsonMatch) {
      console.error("No JSON found in Claude response for website suggestions");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      url: string;
      description: string;
      ingredients: string[];
      discountMatches: string[];
    }>;

    // 4. Fetch ratings for the picked recipes (in parallel)
    const ratingResults = await Promise.allSettled(
      parsed.map((pick) => getRecipeRating(pick.url)),
    );

    const suggestions: Suggestion[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const pick = parsed[i];

      // Verify the URL is from our scraped list (Claude might hallucinate)
      const listing = allListings.find((l) => l.url === pick.url);
      if (!listing) {
        console.log(`Skipping ${pick.title}: URL not in scraped list`);
        continue;
      }

      const ratingResult = ratingResults[i];
      const ratingData =
        ratingResult.status === "fulfilled" ? ratingResult.value : null;

      // Filter out recipes with rating below 3
      if (ratingData && ratingData.value < 3) {
        console.log(
          `Skipping ${pick.title}: rating ${ratingData.value} < 3`,
        );
        continue;
      }

      suggestions.push({
        title: pick.title,
        description: pick.description || "",
        ingredients: pick.ingredients || [],
        discountMatches: pick.discountMatches || [],
        isExisting: false,
        recipeUrl: pick.url,
        rating: ratingData?.value,
        source: "website",
      });
    }

    return suggestions;
  } catch (err) {
    console.error("Failed to get website suggestions:", err);
    return [];
  }
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

  // 1. Get 2 own recipe suggestions (fast, no AI)
  const ownSuggestions = getOwnRecipeSuggestions(householdId, discounts, exclude);
  console.log(`Generated ${ownSuggestions.length} own recipe suggestions`);

  // 2. Get 3 website suggestions (scraping + AI)
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
