import { Router } from "express";
import { db } from "../db/connection.js";
import {
  groceryList,
  groceryItem,
  weeklyPlan,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /:id — Get list with items grouped by category
router.get("/:id", (req, res) => {
  const householdId = req.user!.householdId;
  const listId = req.params.id;

  const list = db
    .select()
    .from(groceryList)
    .where(eq(groceryList.id, listId))
    .get();

  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  // Verify the list belongs to the user's household via the plan
  const plan = db
    .select()
    .from(weeklyPlan)
    .where(
      and(
        eq(weeklyPlan.id, list.weeklyPlanId),
        eq(weeklyPlan.householdId, householdId),
      ),
    )
    .get();

  if (!plan) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const items = db
    .select()
    .from(groceryItem)
    .where(eq(groceryItem.groceryListId, listId))
    .all();

  // Group by category
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  }

  // Sort items within each category by sortOrder
  for (const category of Object.keys(grouped)) {
    grouped[category].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Map items to include `checked` boolean for frontend
  const mappedItems = items.map((item) => ({
    ...item,
    checked: item.status === "checked",
    source: item.source === "staple" ? "basis" : item.source === "manual" ? "handmatig" : "recept",
  }));

  res.json({
    ...list,
    planId: list.weeklyPlanId,
    items: mappedItems,
  });
});

// PATCH /:id/items/:itemId — Update item status (check/skip)
router.patch("/:id/items/:itemId", (req, res) => {
  const householdId = req.user!.householdId;
  const { id: listId, itemId } = req.params;

  // Accept either { status: "checked" } or { checked: true }
  let status: string;
  if (req.body.status) {
    status = req.body.status;
  } else if (req.body.checked !== undefined) {
    status = req.body.checked ? "checked" : "pending";
  } else {
    res.status(400).json({ error: "status or checked is required" });
    return;
  }

  if (!["pending", "checked", "skipped"].includes(status)) {
    res.status(400).json({ error: "status must be 'pending', 'checked', or 'skipped'" });
    return;
  }

  // Verify list ownership
  const list = db
    .select()
    .from(groceryList)
    .where(eq(groceryList.id, listId))
    .get();

  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const plan = db
    .select()
    .from(weeklyPlan)
    .where(
      and(
        eq(weeklyPlan.id, list.weeklyPlanId),
        eq(weeklyPlan.householdId, householdId),
      ),
    )
    .get();

  if (!plan) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const item = db
    .select()
    .from(groceryItem)
    .where(
      and(
        eq(groceryItem.id, itemId),
        eq(groceryItem.groceryListId, listId),
      ),
    )
    .get();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  db.update(groceryItem)
    .set({
      status: status as "pending" | "checked" | "skipped",
      checkedBy: status === "checked" ? req.user!.userId : null,
      checkedAt: status === "checked" ? new Date().toISOString() : null,
    })
    .where(eq(groceryItem.id, itemId))
    .run();

  const updated = db.select().from(groceryItem).where(eq(groceryItem.id, itemId)).get();
  res.json(updated);
});

// POST /:id/items — Add a manual item to the list
router.post("/:id/items", (req, res) => {
  const householdId = req.user!.householdId;
  const listId = req.params.id;
  const { name, quantity, unit, category } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  // Verify list ownership
  const list = db
    .select()
    .from(groceryList)
    .where(eq(groceryList.id, listId))
    .get();

  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const plan = db
    .select()
    .from(weeklyPlan)
    .where(
      and(
        eq(weeklyPlan.id, list.weeklyPlanId),
        eq(weeklyPlan.householdId, householdId),
      ),
    )
    .get();

  if (!plan) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  // Find the highest sortOrder in the list to append at the end
  const lastItem = db
    .select()
    .from(groceryItem)
    .where(eq(groceryItem.groceryListId, listId))
    .all();

  const maxSort = lastItem.reduce((max, i) => Math.max(max, i.sortOrder), -1);

  const id = crypto.randomUUID();
  db.insert(groceryItem)
    .values({
      id,
      groceryListId: listId,
      name,
      quantity: quantity || 1,
      unit: unit || "stuks",
      category: category || "Overig",
      source: "manual",
      sortOrder: maxSort + 1,
    })
    .run();

  const created = db.select().from(groceryItem).where(eq(groceryItem.id, id)).get();
  res.status(201).json(created);
});

export default router;
