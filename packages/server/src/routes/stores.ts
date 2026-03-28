import {Router} from "express";
import {db} from "../db/connection.js";
import {storeConfig} from "../db/schema.js";
import {and, eq} from "drizzle-orm";
import {requireAuth} from "../middleware/auth.js";
import {DEFAULT_CATEGORIES} from "../utils/categories.js";

const router = Router();
router.use(requireAuth);

// GET /config — Get category orderings for both stores
router.get("/config", (req, res) => {
  const householdId = req.user!.householdId;

  const configs = db
    .select()
    .from(storeConfig)
    .where(eq(storeConfig.householdId, householdId))
    .all();

  // Return configs keyed by store, with defaults if not configured
  const result: Record<string, string[]> = {
    albert_heijn: DEFAULT_CATEGORIES,
    jumbo: DEFAULT_CATEGORIES,
  };

  for (const config of configs) {
    result[config.store] = config.categoryOrder;
  }

  res.json(result);
});

// PUT /config/:store — Update category order for a store
router.put("/config/:store", (req, res) => {
  const householdId = req.user!.householdId;
  const store = req.params.store;

  if (store !== "jumbo" && store !== "albert_heijn") {
    res.status(400).json({ error: "store must be 'jumbo' or 'albert_heijn'" });
    return;
  }

  const { categoryOrder } = req.body;
  if (!Array.isArray(categoryOrder)) {
    res.status(400).json({ error: "categoryOrder must be an array of strings" });
    return;
  }

  const existing = db
    .select()
    .from(storeConfig)
    .where(
      and(
        eq(storeConfig.householdId, householdId),
        eq(storeConfig.store, store),
      ),
    )
    .get();

  if (existing) {
    db.update(storeConfig)
      .set({ categoryOrder })
      .where(eq(storeConfig.id, existing.id))
      .run();
  } else {
    db.insert(storeConfig)
      .values({
        id: crypto.randomUUID(),
        householdId,
        store,
        categoryOrder,
      })
      .run();
  }

  const updated = db
    .select()
    .from(storeConfig)
    .where(
      and(
        eq(storeConfig.householdId, householdId),
        eq(storeConfig.store, store),
      ),
    )
    .get();

  res.json(updated);
});

export default router;
