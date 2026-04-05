import {db} from "../db/connection.js";
import {cachedSuggestion, productDiscount,} from "../db/schema.js";
import {and, eq, gte, lte} from "drizzle-orm";
import {member} from "../db/auth-schema.js";
import {client} from "./ai.js";

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
 * Use Claude web search to find Dutch recipes that use discounted ingredients.
 */
async function getWebsiteSuggestions(
  _householdId: string,
  discounts: Discount[],
  excludeTitles: string[],
): Promise<Suggestion[]> {
  if (discounts.length === 0) {
    console.log("No current discounts, skipping web recipe suggestions");
    return [];
  }

  const discountList = discounts
    .slice(0, 20)
    .map((d) => `- ${d.productName} (${d.store}, -${d.discountPercentage}%)`)
    .join("\n");

  const excludeSection = excludeTitles.length > 0
    ? `\n\nRecepten om te vermijden (al getoond):\n${excludeTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  const prompt = `Je bent een Nederlands recepten-assistent. Zoek op het web naar recepten die gebruikmaken van ingrediënten die nu in de aanbieding zijn.

Ingrediënten in de aanbieding:
${discountList}${excludeSection}

Zoek naar 5 verschillende Nederlandse hoofdgerechten die zoveel mogelijk aanbiedingsingrediënten bevatten.
Alleen hoofdgerechten — geen voorgerechten, bijgerechten, desserts, snacks of soepen.
Focus op Nederlandse receptenwebsites (leukerecepten.nl, ah.nl/allerhande, jumbo.com, etc.).

Antwoord ALLEEN met een JSON array (geen markdown, geen uitleg). Elk object moet deze velden hebben:
- "title": naam van het recept
- "description": korte beschrijving (1 zin)
- "ingredients": array van ingrediëntnamen (alleen de namen, geen hoeveelheden)
- "recipeUrl": de URL van het recept
- "rating": beoordeling als gevonden (getal 1-5), of null
- "discountMatches": array van aanbiedingsingrediënten die in het recept zitten`;

  try {
    let response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    // Handle pause_turn (server-side tool loop continuation)
    let continuations = 0;
    while (response.stop_reason === "pause_turn" && continuations < 3) {
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: response.content },
        ],
      });
      continuations++;
    }

    // Extract text blocks from response
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    // Parse JSON from response (may be wrapped in code fences)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log("No JSON array found in web search response");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      description: string;
      ingredients: string[];
      recipeUrl?: string;
      rating?: number | null;
      discountMatches: string[];
    }>;

    return parsed.slice(0, 5).map((r) => ({
      title: r.title,
      description: r.description || "",
      ingredients: r.ingredients || [],
      discountMatches: r.discountMatches || [],
      isExisting: false,
      recipeUrl: r.recipeUrl,
      rating: r.rating ?? undefined,
      source: "website" as const,
    }));
  } catch (error) {
    console.error("Failed to get web recipe suggestions via Claude:", error);
    return [];
  }
}

/**
 * Get recommendations: own recipes + website recipes.
 * Pass exclude to skip already-shown titles.
 */
export async function getRecommendations(
  householdId: string,
  exclude: string[] = [],
): Promise<Suggestion[]> {
  const discounts = getCurrentDiscounts();

  const websiteSuggestions = await getWebsiteSuggestions(householdId, discounts, exclude);
  console.log(`Generated ${websiteSuggestions.length} website suggestions`);

  return websiteSuggestions;
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
