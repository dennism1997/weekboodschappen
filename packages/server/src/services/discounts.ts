import { db } from "../db/connection.js";
import { productDiscount } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

// ---- Types ----

interface NormalizedDiscount {
  productName: string;
  productId: string | null;
  originalPrice: number;
  salePrice: number;
  discountPercentage: number;
  validFrom: string;
  validUntil: string;
  store: "albert_heijn" | "jumbo";
  category: string;
}

export interface DiscountMatch {
  store: string;
  percentage: number;
  originalPrice: number;
  salePrice: number;
}

// ---- AH Discount Fetching ----

const AH_BONUS_API = "https://www.ah.nl/mobile-services/bonuspage/v1/bonus";

/**
 * Fetch current Albert Heijn bonus offers via their public mobile API.
 * Falls back to empty array on failure.
 */
export async function fetchAHDiscounts(): Promise<NormalizedDiscount[]> {
  try {
    const res = await fetch(AH_BONUS_API, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`AH bonus API returned ${res.status}, trying search fallback`);
      return fetchAHDiscountsViaSearch();
    }

    const data = (await res.json()) as {
      bonusCategories?: Array<{
        name?: string;
        segments?: Array<{
          title?: string;
          productId?: string;
          price?: { was?: number; now?: number };
          discount?: { percentage?: number; description?: string };
          validityPeriod?: { from?: string; until?: string };
        }>;
      }>;
    };

    const discounts: NormalizedDiscount[] = [];
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);

    for (const cat of data.bonusCategories ?? []) {
      for (const seg of cat.segments ?? []) {
        const originalPrice = seg.price?.was ?? seg.price?.now ?? 0;
        const salePrice = seg.price?.now ?? 0;
        if (!seg.title || salePrice <= 0) continue;

        const percentage =
          seg.discount?.percentage ??
          (originalPrice > 0
            ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
            : 0);

        discounts.push({
          productName: seg.title,
          productId: seg.productId ?? null,
          originalPrice,
          salePrice,
          discountPercentage: percentage,
          validFrom: seg.validityPeriod?.from ?? weekStart,
          validUntil: seg.validityPeriod?.until ?? weekEnd,
          store: "albert_heijn",
          category: cat.name ?? "Overig",
        });
      }
    }

    if (discounts.length === 0) {
      console.warn("AH bonus API returned 0 discounts, trying search fallback");
      return fetchAHDiscountsViaSearch();
    }

    console.log(`Fetched ${discounts.length} AH discounts`);
    return discounts;
  } catch (err) {
    console.error("Failed to fetch AH discounts:", err);
    return fetchAHDiscountsViaSearch();
  }
}

/**
 * Fallback: use AH product search with bonus filter via their GraphQL API.
 */
async function fetchAHDiscountsViaSearch(): Promise<NormalizedDiscount[]> {
  try {
    // Try using the albert-heijn-wrapper to search for bonus products
    const { AH } = await import("albert-heijn-wrapper");
    const ah = new AH();

    const categories = [
      "groente",
      "fruit",
      "vlees",
      "vis",
      "zuivel",
      "brood",
      "kaas",
      "pasta",
      "rijst",
      "saus",
      "snack",
      "drinken",
    ];

    const discounts: NormalizedDiscount[] = [];
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);

    // Search a few common grocery categories for products on bonus
    for (const query of categories) {
      try {
        const result = await ah.product.search(query, {
          searchInput: { page: { size: 20 } },
        });

        for (const product of result.products ?? []) {
          const price = product.priceV2;
          if (!price?.was || !price?.now || !price.discount) continue;

          const originalPrice = price.was;
          const salePrice = price.now;
          const percentage = Math.round(
            ((originalPrice - salePrice) / originalPrice) * 100,
          );

          if (percentage <= 0) continue;

          discounts.push({
            productName: product.title ?? "Onbekend product",
            productId: String(product.id),
            originalPrice,
            salePrice,
            discountPercentage: percentage,
            validFrom: weekStart,
            validUntil: weekEnd,
            store: "albert_heijn",
            category: product.category?.split("/")[0] ?? "Overig",
          });
        }
      } catch {
        // Skip this category on error
      }
    }

    console.log(`Fetched ${discounts.length} AH discounts via search fallback`);
    return discounts;
  } catch (err) {
    console.error("AH search fallback also failed:", err);
    return [];
  }
}

// ---- Jumbo Discount Fetching ----

const JUMBO_PROMOTIONS_API =
  "https://mobileapi.jumbo.com/v17/promotion-overview";

/**
 * Fetch current Jumbo promotions via their mobile API.
 * Falls back to empty array on failure.
 */
export async function fetchJumboDiscounts(): Promise<NormalizedDiscount[]> {
  try {
    const res = await fetch(JUMBO_PROMOTIONS_API, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn(
        `Jumbo promotions API returned ${res.status}, trying search fallback`,
      );
      return fetchJumboDiscountsViaBrowser();
    }

    const data = (await res.json()) as {
      categories?: Array<{
        title?: string;
        promotions?: Array<{
          title?: string;
          productId?: string;
          originalPrice?: number;
          promotionPrice?: number;
          discount?: string;
          validFrom?: string;
          validUntil?: string;
        }>;
      }>;
      tabs?: Array<{
        title?: string;
        promotions?: Array<{
          title?: string;
          product?: {
            id?: string;
            title?: string;
            prices?: { price?: { amount?: number }; promotionalPrice?: { amount?: number } };
          };
          tag?: { text?: string };
          offerStartDate?: string;
          offerEndDate?: string;
        }>;
      }>;
    };

    const discounts: NormalizedDiscount[] = [];
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);

    // Try categories structure
    for (const cat of data.categories ?? []) {
      for (const promo of cat.promotions ?? []) {
        const originalPrice = promo.originalPrice ?? 0;
        const salePrice = promo.promotionPrice ?? 0;
        if (!promo.title || salePrice <= 0) continue;

        const percentage =
          originalPrice > 0
            ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
            : parseDiscountString(promo.discount);

        discounts.push({
          productName: promo.title,
          productId: promo.productId ?? null,
          originalPrice,
          salePrice,
          discountPercentage: percentage,
          validFrom: promo.validFrom ?? weekStart,
          validUntil: promo.validUntil ?? weekEnd,
          store: "jumbo",
          category: cat.title ?? "Overig",
        });
      }
    }

    // Try tabs structure (newer API format)
    for (const tab of data.tabs ?? []) {
      for (const promo of tab.promotions ?? []) {
        const product = promo.product;
        if (!product?.title) continue;

        const originalPrice =
          (product.prices?.price?.amount ?? 0) / 100;
        const salePrice =
          (product.prices?.promotionalPrice?.amount ?? 0) / 100;
        if (salePrice <= 0) continue;

        const percentage =
          originalPrice > 0
            ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
            : parseDiscountString(promo.tag?.text);

        discounts.push({
          productName: product.title,
          productId: product.id ?? null,
          originalPrice,
          salePrice,
          discountPercentage: percentage,
          validFrom: promo.offerStartDate ?? weekStart,
          validUntil: promo.offerEndDate ?? weekEnd,
          store: "jumbo",
          category: tab.title ?? "Overig",
        });
      }
    }

    if (discounts.length === 0) {
      console.warn("Jumbo API returned 0 discounts, trying search fallback");
      return fetchJumboDiscountsViaBrowser();
    }

    console.log(`Fetched ${discounts.length} Jumbo discounts`);
    return discounts;
  } catch (err) {
    console.error("Failed to fetch Jumbo discounts:", err);
    return fetchJumboDiscountsViaBrowser();
  }
}

/**
 * Fallback: use jumbo-wrapper to search common categories for promoted products.
 */
async function fetchJumboDiscountsViaBrowser(): Promise<NormalizedDiscount[]> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ channel: "chromium" });
    const page = await browser.newPage();

    await page.goto("https://www.jumbo.com/aanbiedingen", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Extract product data from the rendered page
    const products = await page.evaluate(() => {
      const items: Array<{
        title: string;
        originalPrice: number;
        salePrice: number;
        tag: string;
      }> = [];

      // Look for product cards with promotional prices
      const cards = document.querySelectorAll("[data-testid*='product'], [class*='product-card'], [class*='promotion']");
      for (const card of cards) {
        const titleEl = card.querySelector("[class*='title'], h3, h4, [data-testid*='title']");
        const title = titleEl?.textContent?.trim();
        if (!title) continue;

        // Try to find prices
        const priceEls = card.querySelectorAll("[class*='price'], [data-testid*='price']");
        const prices: number[] = [];
        for (const el of priceEls) {
          const text = el.textContent?.replace(/[^0-9.,]/g, "").replace(",", ".") ?? "";
          const val = parseFloat(text);
          if (val > 0) prices.push(val);
        }

        // Look for discount tag
        const tagEl = card.querySelector("[class*='tag'], [class*='badge'], [class*='discount'], [class*='promotion-tag']");
        const tag = tagEl?.textContent?.trim() ?? "";

        if (prices.length >= 2) {
          const originalPrice = Math.max(...prices);
          const salePrice = Math.min(...prices);
          if (salePrice < originalPrice) {
            items.push({ title, originalPrice, salePrice, tag });
          }
        } else if (prices.length === 1 && tag) {
          items.push({ title, originalPrice: prices[0], salePrice: prices[0], tag });
        }
      }

      return items;
    });

    await browser.close();

    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);

    const discounts: NormalizedDiscount[] = products
      .filter((p) => p.salePrice > 0 && p.salePrice < p.originalPrice)
      .map((p) => ({
        productName: p.title,
        productId: null,
        originalPrice: p.originalPrice,
        salePrice: p.salePrice,
        discountPercentage: Math.round(((p.originalPrice - p.salePrice) / p.originalPrice) * 100),
        validFrom: weekStart,
        validUntil: weekEnd,
        store: "jumbo" as const,
        category: "Overig",
      }));

    console.log(`Fetched ${discounts.length} Jumbo discounts via browser`);
    return discounts;
  } catch (err) {
    console.error("Jumbo browser scrape failed:", err);
    return [];
  }
}

// ---- Refresh & Store ----

/**
 * Fetch discounts from specified store (or both), delete old entries, insert new ones.
 */
export async function refreshAllDiscounts(
  store?: string,
): Promise<{ refreshedAt: string; ahCount: number; jumboCount: number }> {
  let ahCount = 0;
  let jumboCount = 0;
  const refreshedAt = new Date().toISOString();

  try {
    if (!store || store === "albert_heijn") {
      const ahDiscounts = await fetchAHDiscounts();
      // Delete old AH discounts
      db.delete(productDiscount)
        .where(eq(productDiscount.store, "albert_heijn"))
        .run();
      // Insert new ones
      for (const d of ahDiscounts) {
        db.insert(productDiscount)
          .values({
            id: crypto.randomUUID(),
            store: d.store,
            productName: d.productName,
            productId: d.productId,
            category: d.category,
            originalPrice: d.originalPrice,
            salePrice: d.salePrice,
            discountPercentage: d.discountPercentage,
            validFrom: d.validFrom,
            validUntil: d.validUntil,
            fetchedAt: refreshedAt,
          })
          .run();
      }
      ahCount = ahDiscounts.length;
    }

    if (!store || store === "jumbo") {
      const jumboDiscounts = await fetchJumboDiscounts();
      // Delete old Jumbo discounts
      db.delete(productDiscount)
        .where(eq(productDiscount.store, "jumbo"))
        .run();
      // Insert new ones
      for (const d of jumboDiscounts) {
        db.insert(productDiscount)
          .values({
            id: crypto.randomUUID(),
            store: d.store,
            productName: d.productName,
            productId: d.productId,
            category: d.category,
            originalPrice: d.originalPrice,
            salePrice: d.salePrice,
            discountPercentage: d.discountPercentage,
            validFrom: d.validFrom,
            validUntil: d.validUntil,
            fetchedAt: refreshedAt,
          })
          .run();
      }
      jumboCount = jumboDiscounts.length;
    }
  } catch (err) {
    console.error("Error during discount refresh:", err);
  }

  console.log(
    `Discount refresh complete: AH=${ahCount}, Jumbo=${jumboCount}`,
  );
  return { refreshedAt, ahCount, jumboCount };
}

// ---- Matching ----

/**
 * For each ingredient, fuzzy-match against current productDiscount entries for a store.
 * Simple substring matching (lowercased).
 */
export function matchDiscountsToIngredients(
  ingredientNames: string[],
  _store?: string,
): Record<string, DiscountMatch> {
  const today = new Date().toISOString().split("T")[0];

  // Fetch all current discounts from ALL stores
  const discounts = db
    .select()
    .from(productDiscount)
    .where(
      sql`${productDiscount.validFrom} <= ${today} AND ${productDiscount.validUntil} >= ${today}`,
    )
    .all();

  const result: Record<string, DiscountMatch> = {};

  for (const ingredientName of ingredientNames) {
    const lower = ingredientName.toLowerCase().trim();
    if (!lower) continue;

    // Find best matching discount: ingredient contained in product name or vice versa
    let bestMatch: (typeof discounts)[number] | null = null;
    let bestPercentage = 0;

    for (const d of discounts) {
      const productLower = d.productName.toLowerCase();

      const isMatch =
        productLower.includes(lower) || lower.includes(productLower);

      if (isMatch && d.discountPercentage > bestPercentage) {
        bestMatch = d;
        bestPercentage = d.discountPercentage;
      }
    }

    if (bestMatch) {
      result[ingredientName] = {
        store: bestMatch.store,
        percentage: bestMatch.discountPercentage,
        originalPrice: bestMatch.originalPrice,
        salePrice: bestMatch.salePrice,
      };
    }
  }

  return result;
}

// ---- Helpers ----

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function getWeekEnd(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7); // Sunday
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function parseDiscountString(str?: string | null): number {
  if (!str) return 0;
  const match = str.match(/(\d+)\s*%/);
  return match ? parseInt(match[1], 10) : 0;
}
