import { Router } from "express";
import { db } from "../db/connection.js";
import { productDiscount } from "../db/schema.js";
import { and, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import {
  refreshAllDiscounts,
  matchDiscountsToIngredients,
} from "../services/discounts.js";

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

// POST /refresh — Manual trigger to refresh discounts
router.post("/refresh", async (req, res) => {
  try {
    const store = req.body?.store as string | undefined;
    const result = await refreshAllDiscounts(store);
    res.json(result);
  } catch (err) {
    console.error("Discount refresh error:", err);
    res.status(500).json({ error: "Failed to refresh discounts" });
  }
});

// GET /compare — Compare discounts for ingredients across stores
router.get("/compare", (req, res) => {
  try {
    const ingredientsParam = req.query.ingredients as string | undefined;
    if (!ingredientsParam) {
      res.status(400).json({ error: "Missing ingredients query parameter" });
      return;
    }

    const ingredients = ingredientsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ingredients.length === 0) {
      res.status(400).json({ error: "No valid ingredients provided" });
      return;
    }

    const jumboMatches = matchDiscountsToIngredients(ingredients, "jumbo");
    const ahMatches = matchDiscountsToIngredients(ingredients, "albert_heijn");

    res.json({
      jumbo: jumboMatches,
      albert_heijn: ahMatches,
    });
  } catch (err) {
    console.error("Discount compare error:", err);
    res.status(500).json({ error: "Failed to compare discounts" });
  }
});

export default router;
