import {client} from "./ai.js";
import {parseIngredient} from "./ingredients.js";
import {fetchWithBrowser} from "./website-scraper.js";
import {db} from "../db/connection.js";
import {recipe} from "../db/schema.js";
import {eq} from "drizzle-orm";

// --- Constants ---

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
};

const EQUIPMENT_KEYWORDS = [
  "bakvorm", "cakevorm", "quichevorm", "taartvorm", "springvorm",
  "ovenschaal", "bakplaat", "bakblik", "muffinvorm",
  "bakpapier", "aluminiumfolie", "huishoudfolie", "vershoudfolie", "plasticfolie",
  "satéprikker", "satestokje", "cocktailprikker",
  "keukenblok", "keukenmachine", "blender", "staafmixer", "mixer", "foodprocessor",
  "zeef", "vergiet", "garde", "spatel", "deegroller",
  "koekenpan", "braadpan", "steelpan", "wok", "grillpan",
  "oven", "magnetron", "airfryer",
  "snijplank", "koksmes",
  "bbq", "barbecue",
];

const EXTRACTION_PROMPT = `Antwoord ALLEEN met een JSON object (geen markdown):
- "title": naam
- "imageUrl": URL van de afbeelding, of null
- "servings": aantal personen (getal)
- "prepTimeMinutes": voorbereidingstijd in minuten, of null
- "cookTimeMinutes": kooktijd in minuten, of null
- "ingredients": array van strings (bijv. "500 g pasta", "2 uien")
- "instructions": array van strings (de stappen)`;

// --- Types ---

export interface ScrapedRecipe {
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: { name: string; quantity: number; unit: string; category: string }[];
  instructions: { step: number; text: string }[];
  needsEnrichment: boolean;
}

// --- Public API ---

/**
 * Scrape a recipe from a URL.
 * Tries JSON-LD first (fast, no AI). If that fails, returns a basic recipe
 * and the caller should kick off enrichRecipe() in the background.
 */
export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  const html = await fetchPage(url);

  if (html) {
    const jsonLdRecipe = extractJsonLdRecipe(html);
    if (jsonLdRecipe) {
      console.log(`[ai-scraper] Extracted recipe from JSON-LD: ${jsonLdRecipe.name}`);
      return buildFromJsonLd(jsonLdRecipe, url, html);
    }

    console.log("[ai-scraper] No JSON-LD found, returning basic recipe for enrichment");
    return buildBasicRecipe(url, html);
  }

  console.log("[ai-scraper] Could not fetch page, returning minimal recipe for enrichment");
  return buildBasicRecipe(url, null);
}

/**
 * Enrich a saved recipe with Claude. Tries server-side fetch first,
 * falls back to Claude's web_fetch tool for 403s.
 * Call in the background — don't await in request handlers.
 */
export async function enrichRecipe(recipeId: string, url: string, distinctId?: string): Promise<void> {
  try {
    // Try HTTP fetch, fall back to Playwright
    const html = await fetchPage(url) ?? await fetchPageWithBrowser(url);
    if (!html) {
      console.error(`[ai-scraper] Could not fetch ${url} for enrichment (HTTP + Playwright both failed)`);
      db.update(recipe).set({ status: "failed" }).where(eq(recipe.id, recipeId)).run();
      return;
    }

    // If the fetched HTML has JSON-LD, use that directly instead of Claude
    const jsonLdRecipe = extractJsonLdRecipe(html);
    if (jsonLdRecipe) {
      const scraped = buildFromJsonLd(jsonLdRecipe, url, html);
      db.update(recipe)
        .set({
          title: scraped.title,
          imageUrl: scraped.imageUrl,
          servings: scraped.servings,
          prepTimeMinutes: scraped.prepTimeMinutes,
          cookTimeMinutes: scraped.cookTimeMinutes,
          ingredients: scraped.ingredients,
          instructions: scraped.instructions,
          status: "ready",
        })
        .where(eq(recipe.id, recipeId))
        .run();
      console.log(`[ai-scraper] Enriched recipe ${recipeId} from JSON-LD: ${scraped.title}`);
      return;
    }

    // No JSON-LD — send HTML to Claude
    const aiResponse = await extractWithAI(html, distinctId);
    const parsed = parseAIResponse(aiResponse);
    if (!parsed) {
      db.update(recipe).set({ status: "failed" }).where(eq(recipe.id, recipeId)).run();
      return;
    }

    const ingredients = (parsed.ingredients || [])
      .map((raw: string) => parseIngredient(raw))
      .filter((ing: any) => ing.name.trim().length > 0 && !isEquipment(ing.name));

    const instructions = (parsed.instructions || []).map((text: string, i: number) => ({
      step: i + 1,
      text: text.replace(/^\d+[\.\)]\s*/, "").trim(),
    }));

    db.update(recipe)
      .set({
        title: parsed.title || undefined,
        imageUrl: parsed.imageUrl || undefined,
        servings: parsed.servings || undefined,
        prepTimeMinutes: parsed.prepTimeMinutes ?? undefined,
        cookTimeMinutes: parsed.cookTimeMinutes ?? undefined,
        ingredients,
        instructions,
        status: "ready",
      })
      .where(eq(recipe.id, recipeId))
      .run();

    console.log(`[ai-scraper] Enriched recipe ${recipeId}: ${parsed.title}`);
  } catch (err) {
    console.error(`[ai-scraper] Enrichment failed for ${recipeId}:`, err);
    try {
      db.update(recipe).set({ status: "failed" }).where(eq(recipe.id, recipeId)).run();
    } catch { /* ignore DB errors in error handler */ }
  }
}

// --- AI extraction ---

async function extractWithAI(html: string, distinctId?: string): Promise<any> {
  // @posthog/ai types don't include MonitoringParams on the non-streaming overload
  const create = client.messages.create.bind(client.messages) as any;
  const trimmed = stripNonContent(html);
  return create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Extraheer het recept uit deze HTML.\n\n${EXTRACTION_PROMPT}\n\nHTML:\n${trimmed}`,
    }],
    posthogDistinctId: distinctId,
  });
}

function parseAIResponse(response: any): any | null {
  const text = response.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");

  console.log("[ai-scraper] AI response stop_reason:", response.stop_reason);
  console.log("[ai-scraper] AI response block types:", response.content.map((b: any) => b.type).join(", "));
  console.log("[ai-scraper] AI response text:", text.slice(0, 500));

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1].trim());

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);

  console.error("[ai-scraper] No JSON found in AI response");
  return null;
}

// --- HTML fetching & parsing ---

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS });
    if (response.ok) return await response.text();
    console.log(`[ai-scraper] Fetch returned ${response.status} for ${url}`);
  } catch (err) {
    console.log(`[ai-scraper] Fetch failed for ${url}:`, err);
  }
  return null;
}

async function fetchPageWithBrowser(url: string): Promise<string | null> {
  try {
    console.log(`[ai-scraper] Trying Playwright for ${url}`);
    return await fetchWithBrowser(url);
  } catch (err) {
    console.log(`[ai-scraper] Playwright fetch failed for ${url}:`, err);
    return null;
  }
}

function stripNonContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/\s+/g, " ")
    .slice(0, 30_000);
}

// --- Recipe builders ---

function buildBasicRecipe(url: string, html: string | null): ScrapedRecipe {
  let title = "Naamloos recept";
  let imageUrl: string | null = null;

  if (html) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim().split(/\s*[-|–]\s*/)[0].trim();
    imageUrl = extractOgImage(html);
  }

  return {
    title,
    sourceUrl: url,
    imageUrl,
    servings: 4,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    ingredients: [],
    instructions: [],
    needsEnrichment: true,
  };
}

function buildFromJsonLd(data: any, url: string, html: string): ScrapedRecipe {
  return {
    title: data.name || "Naamloos recept",
    sourceUrl: url,
    imageUrl: extractJsonLdImage(data) || extractOgImage(html),
    servings: parseServings(data.recipeYield),
    prepTimeMinutes: parseISODuration(data.prepTime),
    cookTimeMinutes: parseISODuration(data.cookTime) || parseISODuration(data.totalTime),
    ingredients: parseJsonLdIngredients(data.recipeIngredient),
    instructions: parseJsonLdInstructions(data.recipeInstructions),
    needsEnrichment: false,
  };
}

// --- JSON-LD extraction ---

function extractJsonLdRecipe(html: string): any | null {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const found = findRecipeInJsonLd(JSON.parse(match[1].trim()));
      if (found) return found;
    } catch {
      // Invalid JSON-LD, skip
    }
  }
  return null;
}

function findRecipeInJsonLd(data: any): any | null {
  if (!data || typeof data !== "object") return null;
  if (data["@type"] === "Recipe") return data;
  if (Array.isArray(data["@type"]) && data["@type"].includes("Recipe")) return data;
  if (Array.isArray(data["@graph"])) {
    for (const item of data["@graph"]) {
      const found = findRecipeInJsonLd(item);
      if (found) return found;
    }
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeInJsonLd(item);
      if (found) return found;
    }
  }
  return null;
}

// --- JSON-LD field parsers ---

function parseJsonLdIngredients(raw: any): ScrapedRecipe["ingredients"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: string) => parseIngredient(s))
    .filter((ing) => ing.name.trim().length > 0 && !isEquipment(ing.name));
}

function parseJsonLdInstructions(raw: any): ScrapedRecipe["instructions"] {
  if (!Array.isArray(raw)) return [];
  const steps: { step: number; text: string }[] = [];
  let n = 1;
  for (const item of raw) {
    if (typeof item === "string") {
      steps.push({ step: n++, text: item.trim() });
    } else if (item["@type"] === "HowToStep" && item.text) {
      steps.push({ step: n++, text: item.text.trim() });
    } else if (item["@type"] === "HowToSection" && Array.isArray(item.itemListElement)) {
      for (const sub of item.itemListElement) {
        if (sub.text) steps.push({ step: n++, text: sub.text.trim() });
      }
    }
  }
  return steps;
}

function extractJsonLdImage(data: any): string | null {
  if (typeof data.image === "string") return data.image;
  if (Array.isArray(data.image)) return data.image[0]?.url || data.image[0] || null;
  if (data.image?.url) return data.image.url;
  return null;
}

// --- HTML helpers ---

function extractOgImage(html: string): string | null {
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return match?.[1] ?? null;
}

function isEquipment(name: string): boolean {
  const lower = name.toLowerCase();
  return EQUIPMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

// --- Value parsers ---

function parseServings(value: any): number {
  if (!value) return 4;
  const str = Array.isArray(value) ? value[0] : String(value);
  const num = parseInt(String(str).replace(/\D/g, ""), 10);
  return isNaN(num) || num <= 0 ? 4 : num;
}

function parseISODuration(value: any): number | null {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (match) return (parseInt(match[1] || "0", 10) * 60) + parseInt(match[2] || "0", 10);
  const num = parseInt(value.replace(/\D/g, ""), 10);
  return isNaN(num) ? null : num;
}
