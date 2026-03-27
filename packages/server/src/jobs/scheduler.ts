import { schedule } from "node-cron";
import { db } from "../db/connection.js";
import { productDiscount } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { refreshAllDiscounts } from "../services/discounts.js";

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

/**
 * Initialize the discount scheduler.
 * - On startup, refresh if stale
 * - Schedule weekly refresh on Monday at 06:00
 */
export function initScheduler(): void {
  // Check on startup if discounts need refreshing
  if (discountsAreStale()) {
    console.log("Discounts are stale, refreshing...");
    refreshAllDiscounts().catch((err) => {
      console.error("Startup discount refresh failed:", err);
    });
  } else {
    console.log("Discounts are fresh, skipping startup refresh.");
  }

  // Schedule weekly refresh: Monday at 06:00
  schedule("0 6 * * 1", () => {
    console.log("Running scheduled discount refresh (Monday 06:00)...");
    refreshAllDiscounts().catch((err) => {
      console.error("Scheduled discount refresh failed:", err);
    });
  });

  console.log("Discount scheduler initialized (cron: Monday 06:00).");
}
