import { chromium } from "playwright";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
};

export interface ScrapedRecipeListing {
  title: string;
  url: string;
  siteName: string;
}

/**
 * Scrape a recipe website's listing/homepage to extract real recipe links and titles.
 */
export async function scrapeRecipeListings(websiteUrl: string): Promise<ScrapedRecipeListing[]> {
  const baseUrl = new URL(websiteUrl);
  const siteName = baseUrl.hostname
    .replace("www.", "")
    .split(".")[0]
    .replace(/([a-z])([A-Z])/g, "$1 $2");

  let html: string;
  try {
    const response = await fetch(websiteUrl, { headers: BROWSER_HEADERS });
    if (response.status === 403) {
      html = await fetchWithBrowser(websiteUrl);
    } else if (!response.ok) {
      console.error(`Failed to fetch ${websiteUrl}: ${response.status}`);
      return [];
    } else {
      html = await response.text();
    }
  } catch (err) {
    console.error(`Error fetching ${websiteUrl}:`, err);
    return [];
  }

  const recipes: ScrapedRecipeListing[] = [];
  const seen = new Set<string>();

  // Extract all <a href="...">...</a> blocks
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const content = match[2];

    // Resolve relative URLs
    let fullUrl: string;
    try {
      fullUrl = new URL(href, websiteUrl).href;
    } catch {
      continue;
    }

    // Must be on same domain
    if (!fullUrl.includes(baseUrl.hostname)) continue;

    // Must look like a recipe URL
    if (!isRecipeUrl(fullUrl, baseUrl.hostname)) continue;

    // Extract title from link text (strip HTML tags)
    const title = content
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!title || title.length < 3 || title.length > 120) continue;

    // Skip navigation-like links
    if (/^(home|menu|contact|over ons|zoek|inloggen)/i.test(title)) continue;

    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    recipes.push({ title, url: fullUrl, siteName });
  }

  return recipes;
}

/**
 * Determine if a URL looks like a recipe page (not a category or index page).
 */
function isRecipeUrl(url: string, hostname: string): boolean {
  const path = new URL(url).pathname;

  // Site-specific patterns
  if (hostname.includes("leukerecepten")) {
    return /^\/recepten\/[a-z0-9-]+\/?$/.test(path);
  }
  if (hostname.includes("ah.nl")) {
    return /^\/allerhande\/recept\//.test(path);
  }

  // Generic: must have a recipe-related segment and a slug
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  return /recept|recipe/i.test(path);
}

/**
 * Fetch a single recipe page and extract its rating from JSON-LD structured data.
 */
export async function getRecipeRating(
  url: string,
): Promise<{ value: number; count: number } | null> {
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS });
    if (!response.ok) {
      // Try with browser for sites that block simple fetch
      const html = await fetchWithBrowser(url);
      return extractRatingFromHtml(html);
    }
    const html = await response.text();
    return extractRatingFromHtml(html);
  } catch {
    return null;
  }
}

function extractRatingFromHtml(html: string): { value: number; count: number } | null {
  // Find all JSON-LD scripts
  const jsonLdRegex = /application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const rating = findRatingInJsonLd(data);
      if (rating) return rating;
    } catch {
      continue;
    }
  }
  return null;
}

function findRatingInJsonLd(data: any): { value: number; count: number } | null {
  if (!data || typeof data !== "object") return null;

  // Direct Recipe type with aggregateRating
  if (data["@type"] === "Recipe" && data.aggregateRating) {
    const value = parseFloat(data.aggregateRating.ratingValue);
    const count = parseInt(data.aggregateRating.ratingCount || "0", 10);
    if (!isNaN(value)) return { value, count };
  }

  // Check @graph array (Yoast SEO style)
  if (Array.isArray(data["@graph"])) {
    for (const item of data["@graph"]) {
      const r = findRatingInJsonLd(item);
      if (r) return r;
    }
  }

  return null;
}

async function fetchWithBrowser(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
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
