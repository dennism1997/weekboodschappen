import { scrapeRecipe as scrapeRecipeFromHtml } from "recipe-scrapers";
import { chromium } from "playwright";
import { parseIngredient } from "./ingredients.js";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

async function fetchWithBrowser(url: string): Promise<string> {
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const context = await browser.newContext({
      userAgent: BROWSER_HEADERS["User-Agent"],
      locale: "nl-NL",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

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
  // Fetch the HTML — try fast fetch first, fall back to headless browser on 403
  let html: string;
  const response = await fetch(url, { headers: BROWSER_HEADERS });
  if (response.status === 403) {
    html = await fetchWithBrowser(url);
  } else if (!response.ok) {
    throw new Error(`Failed to fetch recipe page: ${response.status}`);
  } else {
    html = await response.text();
  }

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

  // Extract instructions with group headings, filtering out "stap N" noise
  const instructionSteps: { step: number; text: string }[] = [];
  let stepNum = 1;
  const stepHeaderPattern = /^stap\s*\d+\.?:?\s*$/i;
  const numberedStepPattern = /^stap\s*\d+\.?:?\s+/i;
  const instructionGroups = data.instructions || [];
  for (const group of instructionGroups) {
    // Add group heading as a step (e.g. "Voor de saus:", "Bereiding:")
    if (group.name) {
      const heading = group.name.trim();
      if (heading && !stepHeaderPattern.test(heading)) {
        instructionSteps.push({ step: stepNum++, text: `**${heading}**` });
      }
    }
    for (const item of group.items) {
      let text = item.value.trim();
      if (!text || stepHeaderPattern.test(text)) continue;
      // Strip leading "Stap 1: " prefix from the text itself
      text = text.replace(numberedStepPattern, "");
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
