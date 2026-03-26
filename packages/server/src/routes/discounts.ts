import { Router } from "express";
import { db } from "../db/connection.js";
import { productDiscount } from "../db/schema.js";
import { and, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET / — Get current week's discounts
router.get("/", (_req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const discounts = db
    .select()
    .from(productDiscount)
    .where(
      and(
        sql`${productDiscount.validFrom} <= ${today}`,
        sql`${productDiscount.validUntil} >= ${today}`,
      ),
    )
    .all();

  res.json(discounts);
});

// POST /refresh — Manual trigger to refresh discounts (placeholder)
router.post("/refresh", (_req, res) => {
  // TODO: implement discount scraping/fetching from store APIs
  res.json({
    message: "Discount refresh not yet implemented",
    refreshedAt: new Date().toISOString(),
  });
});

export default router;
