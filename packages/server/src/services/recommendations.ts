import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/connection.js";
import { recipe, productDiscount, weeklyStaple, favoriteWebsite } from "../db/schema.js";
import { eq, and, gte, lte } from "drizzle-orm";

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
}

function getSeason(date: Date): string {
  const month = date.getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return "lente";
  if (month >= 6 && month <= 8) return "zomer";
  if (month >= 9 && month <= 11) return "herfst";
  return "winter";
}

export async function getRecommendations(
  householdId: string,
  weekStart: string,
  exclude: string[] = [],
): Promise<Suggestion[]> {
  const today = new Date().toISOString().split("T")[0];
  const season = getSeason(new Date());

  // 1. Current discounts
  const discounts = db
    .select({
      productName: productDiscount.productName,
      store: productDiscount.store,
      discountPercentage: productDiscount.discountPercentage,
      salePrice: productDiscount.salePrice,
    })
    .from(productDiscount)
    .where(and(lte(productDiscount.validFrom, today), gte(productDiscount.validUntil, today)))
    .all();

  // 2. All recipes for the household (recipe library)
  const allRecipes = db
    .select({
      id: recipe.id,
      title: recipe.title,
      tags: recipe.tags,
      timesCooked: recipe.timesCooked,
      lastCookedAt: recipe.lastCookedAt,
    })
    .from(recipe)
    .where(eq(recipe.householdId, householdId))
    .all();

  // 3. Last 8 weeks of cooking history
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  const eightWeeksAgoStr = eightWeeksAgo.toISOString().split("T")[0];

  const recentlyCooked = allRecipes.filter(
    (r) => r.lastCookedAt && r.lastCookedAt >= eightWeeksAgoStr,
  );

  // 4. Active staples
  const staples = db
    .select({ name: weeklyStaple.name })
    .from(weeklyStaple)
    .where(and(eq(weeklyStaple.householdId, householdId), eq(weeklyStaple.active, true)))
    .all();

  // 5. Favorite recipe websites
  const websites = db
    .select({ url: favoriteWebsite.url, name: favoriteWebsite.name })
    .from(favoriteWebsite)
    .where(eq(favoriteWebsite.householdId, householdId))
    .all();

  // Build the prompt
  const discountSection =
    discounts.length > 0
      ? `\nHuidige aanbiedingen:\n${discounts.map((d) => `- ${d.productName} (${d.store}, ${d.discountPercentage}% korting, nu ${d.salePrice} EUR)`).join("\n")}\nGeef voorkeur aan recepten die deze afgeprijsde producten gebruiken.\n`
      : "\nEr zijn momenteel geen aanbiedingen beschikbaar.\n";

  const recentSection =
    recentlyCooked.length > 0
      ? `\nRecent gekookte recepten (vermijd herhaling):\n${recentlyCooked.map((r) => `- ${r.title} (laatst gekookt: ${r.lastCookedAt})`).join("\n")}\n`
      : "";

  const librarySection =
    allRecipes.length > 0
      ? `\nBestaande receptenbibliotheek van het huishouden:\n${allRecipes.map((r) => `- "${r.title}" (id: ${r.id})`).join("\n")}\nAls je een recept suggereert dat al in de bibliotheek staat, zet dan isExisting op true en vul existingRecipeId in met het bijbehorende id.\n`
      : "";

  const staplesSection =
    staples.length > 0
      ? `\nWekelijkse basisproducten (hoef je niet als ingredienten te noemen): ${staples.map((s) => s.name).join(", ")}\n`
      : "";

  const websitesSection =
    websites.length > 0
      ? `\nFavoriete receptenwebsites van het huishouden:\n${websites.map((w) => `- ${w.name}: ${w.url}`).join("\n")}\nZoek bij voorkeur recepten van deze websites. Geef voor elk recept de directe URL naar het recept op de website (recipeUrl). Als je geen exacte URL weet, geef dan de zoek-URL van de website.\n`
      : "";

  const excludeSection =
    exclude.length > 0
      ? `\nAl gesuggereerde recepten (NIET opnieuw suggereren):\n${exclude.map((t) => `- ${t}`).join("\n")}\nSuggereer ALLEEN recepten die NIET in deze lijst staan. Bedenk volledig nieuwe suggesties.\n`
      : "";

  const prompt = `Je bent een behulpzame Nederlandse maaltijdplanner. Stel 5 hoofdgerechten voor voor een Nederlands huishouden. Suggereer ALLEEN hoofdgerechten (geen bijgerechten, voorgerechten, desserts of snacks).

Context:
- Seizoen: ${season}
- Week van: ${weekStart}
${discountSection}${recentSection}${librarySection}${staplesSection}${websitesSection}${excludeSection}

Regels:
- Suggereer ALLEEN hoofdgerechten — geen bijgerechten, voorgerechten, desserts of snacks.
- Suggereer een mix van Nederlandse en internationale gerechten die passen bij Nederlandse supermarkten (Albert Heijn, Jumbo).
- Houd rekening met het seizoen (${season}) voor seizoensgebonden groenten en smaken.
- Vermijd recepten die recent gekookt zijn.
- Als een suggestie overeenkomt met een recept in de bestaande bibliotheek, gebruik dan dat recept (isExisting: true, existingRecipeId: het id).
- Nieuwe suggesties moeten isExisting: false hebben.
- discountMatches moet de namen bevatten van afgeprijsde producten die in het recept passen.
${websites.length > 0 ? `- Gebruik bij voorkeur recepten van de favoriete websites. Vul recipeUrl in met de directe link naar het recept.
- Suggereer ALLEEN recepten die een goede beoordeling hebben (minimaal 3 uit 5 sterren of equivalent). Vul het rating veld in met de beoordeling (1-5 schaal). Recepten zonder beoordeling mogen wel, maar zet rating dan op null.
` : ""}
Antwoord ALLEEN met geldige JSON in dit formaat:
[
  {
    "title": "Naam van het gerecht",
    "description": "Korte beschrijving (1-2 zinnen)",
    "ingredients": ["ingredi\u00ebnt1", "ingredi\u00ebnt2"],
    "discountMatches": ["product in aanbieding"],
    "isExisting": false,
    "existingRecipeId": null,
    "recipeUrl": null,
    "rating": null
  }
]`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Extract JSON from the response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in response");
    }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      description: string;
      ingredients: string[];
      discountMatches: string[];
      isExisting: boolean;
      existingRecipeId?: string | null;
      recipeUrl?: string | null;
      rating?: number | null;
    }>;

    return parsed
      .filter((item) => {
        // Filter out recipes with rating below 3
        if (item.rating != null && item.rating < 3) return false;
        return true;
      })
      .map((item) => ({
        title: item.title,
        description: item.description || "",
        ingredients: item.ingredients || [],
        discountMatches: item.discountMatches || [],
        isExisting: item.isExisting || false,
        existingRecipeId: item.existingRecipeId || undefined,
        recipeUrl: item.recipeUrl || undefined,
        rating: item.rating ?? undefined,
      }));
  } catch {
    // JSON parse failure — return empty to trigger fallback
    return [];
  }
}
