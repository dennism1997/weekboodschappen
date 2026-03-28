import {Router} from "express";
import {db} from "../db/connection.js";
import {shoppingHistory, weeklyStaple} from "../db/schema.js";
import {and, eq, sql} from "drizzle-orm";
import {requireAuth} from "../middleware/auth.js";
import {createStapleSchema, validate} from "../validation/schemas.js";

const router = Router();
router.use(requireAuth);

// GET / — List household staples
router.get("/", (req, res) => {
  const householdId = req.user!.householdId;

  const staples = db
    .select()
    .from(weeklyStaple)
    .where(eq(weeklyStaple.householdId, householdId))
    .all();

  res.json(staples);
});

// POST / — Add a staple
router.post("/", validate(createStapleSchema), (req, res) => {
  const householdId = req.user!.householdId;
  const { name, defaultQuantity, quantity, unit, category } = req.body;
  const qty = defaultQuantity ?? quantity;

  if (!name || qty === undefined || !unit || !category) {
    res
      .status(400)
      .json({ error: "name, quantity, unit, and category are required" });
    return;
  }

  const id = crypto.randomUUID();
  db.insert(weeklyStaple)
    .values({
      id,
      householdId,
      name,
      defaultQuantity: qty,
      unit,
      category,
    })
    .run();

  const created = db
    .select()
    .from(weeklyStaple)
    .where(eq(weeklyStaple.id, id))
    .get();
  res.status(201).json(created);
});

// PUT/PATCH /:id — Update a staple
function handleUpdateStaple(req: any, res: any) {
  const householdId = req.user!.householdId;
  const stapleId = req.params.id;

  const existing = db
    .select()
    .from(weeklyStaple)
    .where(
      and(
        eq(weeklyStaple.id, stapleId),
        eq(weeklyStaple.householdId, householdId),
      ),
    )
    .get();

  if (!existing) {
    res.status(404).json({ error: "Staple not found" });
    return;
  }

  const { name, defaultQuantity, quantity, unit, category, active } = req.body;

  db.update(weeklyStaple)
    .set({
      ...(name !== undefined && { name }),
      ...((defaultQuantity ?? quantity) !== undefined && { defaultQuantity: defaultQuantity ?? quantity }),
      ...(unit !== undefined && { unit }),
      ...(category !== undefined && { category }),
      ...(active !== undefined && { active }),
    })
    .where(eq(weeklyStaple.id, stapleId))
    .run();

  const updated = db
    .select()
    .from(weeklyStaple)
    .where(eq(weeklyStaple.id, stapleId))
    .get();
  res.json(updated);
}
router.put("/:id", handleUpdateStaple);
router.patch("/:id", handleUpdateStaple);

// DELETE /:id — Delete a staple
router.delete("/:id", (req, res) => {
  const householdId = req.user!.householdId;
  const stapleId = req.params.id;

  const existing = db
    .select()
    .from(weeklyStaple)
    .where(
      and(
        eq(weeklyStaple.id, stapleId),
        eq(weeklyStaple.householdId, householdId),
      ),
    )
    .get();

  if (!existing) {
    res.status(404).json({ error: "Staple not found" });
    return;
  }

  db.delete(weeklyStaple).where(eq(weeklyStaple.id, stapleId)).run();
  res.json({ ok: true });
});

// GET /suggestions — Items bought 4+ consecutive weeks that aren't already staples
router.get("/suggestions", (req, res) => {
  const householdId = req.user!.householdId;

  // Get existing staple names for exclusion
  const existingStaples = db
    .select({ name: weeklyStaple.name })
    .from(weeklyStaple)
    .where(eq(weeklyStaple.householdId, householdId))
    .all()
    .map((s) => s.name.toLowerCase());

  // Find items purchased in 4+ distinct weeks
  const candidates = db
    .select({
      itemName: shoppingHistory.itemName,
      category: shoppingHistory.category,
      weekCount: sql<number>`COUNT(DISTINCT ${shoppingHistory.weekStart})`,
    })
    .from(shoppingHistory)
    .where(
      and(
        eq(shoppingHistory.householdId, householdId),
        eq(shoppingHistory.wasPurchased, true),
      ),
    )
    .groupBy(shoppingHistory.itemName, shoppingHistory.category)
    .having(sql`COUNT(DISTINCT ${shoppingHistory.weekStart}) >= 4`)
    .all();

  // Filter out items that are already staples
  const suggestions = candidates.filter(
    (c) => !existingStaples.includes(c.itemName.toLowerCase()),
  );

  res.json(suggestions);
});

export default router;
