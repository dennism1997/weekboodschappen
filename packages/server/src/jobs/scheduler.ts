import { schedule } from "node-cron";
import { db } from "../db/connection.js";
import { productDiscount } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { refreshAllDiscounts } from "../services/discounts.js";
import { refreshAllCachedSuggestions } from "../services/recommendations.js";

const STALE_HOURS = 24;

/**
 * Check if discounts are stale (last fetchedAt > 24h ago or no discounts exist).
 */
function discountsAreStale(): boolean {
  const latest = db
    .select({ fetchedAt: productDiscount.fetchedAt })
    .from(productDiscount)
    .orderBy(sql`${productDiscount.fetchedAt} DESC`)
    .limit(1)
    .get();

  if (!latest) return true;

  const fetchedAt = new Date(latest.fetchedAt);
  const now = new Date();
  const diffHours =
    (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);

  return diffHours > STALE_HOURS;
}

async function refreshDiscountsAndSuggestions(): Promise<void> {
  await refreshAllDiscounts();
  console.log("Discounts refreshed, now generating suggestions...");
  await refreshAllCachedSuggestions();
}

/**
 * Initialize the discount scheduler.
 * - On startup, refresh if stale
 * - Schedule daily refresh at 06:00
 */
export function initScheduler(): void {
  // Check on startup if discounts need refreshing
  if (discountsAreStale()) {
    console.log("Discounts are stale, refreshing...");
    refreshDiscountsAndSuggestions().catch((err) => {
      console.error("Startup refresh failed:", err);
    });
  } else {
    console.log("Discounts are fresh, skipping startup refresh.");
  }

  // Schedule daily refresh at 06:00
  schedule("0 6 * * *", () => {
    console.log("Running scheduled refresh (daily 06:00)...");
    refreshDiscountsAndSuggestions().catch((err) => {
      console.error("Scheduled refresh failed:", err);
    });
  });

  console.log("Discount & suggestion scheduler initialized (cron: daily 06:00).");
}
