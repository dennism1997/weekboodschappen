import {schedule} from "node-cron";
import {db} from "../db/connection.js";
import {cachedSuggestion, productDiscount} from "../db/schema.js";
import {sql} from "drizzle-orm";
import {refreshAllDiscounts} from "../services/discounts.js";
import {refreshAllCachedSuggestions} from "../services/recommendations.js";
import {sendPushoverNotification} from "../services/pushover.js";
import {statSync} from "node:fs";

const STALE_HOURS = 24;
const DB_SIZE_WARNING_MB = 100;

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
  try {
    await refreshAllDiscounts();
    console.log("Discounts refreshed, now generating suggestions...");
    await refreshAllCachedSuggestions();
  } catch (err) {
    console.error("Refresh failed:", err);
    sendPushoverNotification({
      title: "Kortingen refresh mislukt",
      message: `Fout: ${err instanceof Error ? err.message : String(err)}`,
      priority: 1,
    }).catch(() => {});
    throw err;
  }
}

function checkDatabaseSize(): void {
  const dbPath = process.env.DATABASE_PATH || "./data/weekboodschappen.db";
  try {
    const stats = statSync(dbPath);
    const sizeMB = stats.size / 1024 / 1024;
    if (sizeMB > DB_SIZE_WARNING_MB) {
      sendPushoverNotification({
        title: "Database waarschuwing",
        message: `Database is ${Math.round(sizeMB)}MB (limiet: ${DB_SIZE_WARNING_MB}MB)`,
      }).catch(() => {});
    }
  } catch {
    // File stat failed — ignore
  }
}

/**
 * Initialize the discount scheduler.
 * - On startup, refresh if stale
 * - Schedule daily refresh at 06:00
 */
export function initScheduler(): void {
  // Check on startup if discounts or suggestions need refreshing
  const hasCachedSuggestions = db.select().from(cachedSuggestion).limit(1).get();

  if (discountsAreStale()) {
    console.log("Discounts are stale, refreshing...");
    refreshDiscountsAndSuggestions().catch((err) => {
      console.error("Startup refresh failed:", err);
    });
  } else if (!hasCachedSuggestions) {
    console.log("No cached suggestions found, generating...");
    refreshAllCachedSuggestions().catch((err) => {
      console.error("Startup suggestion generation failed:", err);
    });
  } else {
    console.log("Discounts and suggestions are fresh, skipping startup refresh.");
  }

  // Schedule daily refresh at 06:00
  schedule("0 6 * * *", () => {
    console.log("Running scheduled refresh (daily 06:00)...");
    refreshDiscountsAndSuggestions().catch((err) => {
      console.error("Scheduled refresh failed:", err);
    });
    checkDatabaseSize();
  });

  console.log("Discount & suggestion scheduler initialized (cron: daily 06:00).");
}
