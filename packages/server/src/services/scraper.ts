import { scrapeRecipe as scrapeRecipeFromHtml } from "recipe-scrapers";
import { parseIngredient } from "./ingredients.js";

interface ScrapedRecipe {
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: {
    name: string;
    quantity: number;
    unit: string;
    category: string;
  }[];
  instructions: {
    step: number;
    text: string;
  }[];
}

export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  // Fetch the HTML
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Weekboodschappen/1.0)",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch recipe page: ${response.status}`);
  }
  const html = await response.text();

  // Parse recipe from HTML
  const data = await scrapeRecipeFromHtml(html, url);

  // Extract ingredient strings
  const rawIngredients: string[] = [];
  const ingredientGroups = data.ingredients || [];
  for (const group of ingredientGroups) {
    for (const item of group.items) {
      rawIngredients.push(item.value);
    }
  }

  const ingredients = rawIngredients
    .filter((raw) => raw.trim().length > 0)
    .map((raw) => parseIngredient(raw))
    .filter((ing) => ing.name.trim().length > 0);

  // Extract instructions, filtering out step headers like "stap 1", "stap 2"
  const instructionSteps: { step: number; text: string }[] = [];
  let stepNum = 1;
  const stepHeaderPattern = /^stap\s*\d+$/i;
  const instructionGroups = data.instructions || [];
  for (const group of instructionGroups) {
    for (const item of group.items) {
      const text = item.value.trim();
      if (!text || stepHeaderPattern.test(text)) continue;
      instructionSteps.push({ step: stepNum++, text });
    }
  }

  const prepTime = parseTimeToMinutes(data.prepTime);
  const cookTime = parseTimeToMinutes(data.cookTime);
  const totalTime = parseTimeToMinutes(data.totalTime);

  return {
    title: data.title || "Naamloos recept",
    sourceUrl: url,
    imageUrl: data.image || null,
    servings: parseServings(data.yields),
    prepTimeMinutes: prepTime,
    cookTimeMinutes: cookTime || (totalTime && prepTime ? totalTime - prepTime : totalTime),
    ingredients,
    instructions: instructionSteps,
  };
}

function parseServings(yields: string | undefined | null): number {
  if (!yields) return 4;
  const num = parseInt(yields.replace(/\D/g, ""), 10);
  return isNaN(num) || num <= 0 ? 4 : num;
}

function parseTimeToMinutes(time: string | number | undefined | null): number | null {
  if (time == null) return null;
  if (typeof time === "number") return time;

  const isoMatch = time.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (isoMatch) {
    const hours = parseInt(isoMatch[1] || "0", 10);
    const minutes = parseInt(isoMatch[2] || "0", 10);
    return hours * 60 + minutes;
  }

  const num = parseInt(time.replace(/\D/g, ""), 10);
  return isNaN(num) ? null : num;
}
