import {Router} from "express";
import {db} from "../db/connection.js";
import {groceryItem, groceryList,} from "../db/schema.js";
import {and, eq} from "drizzle-orm";
import {requireAuth} from "../middleware/auth.js";
import {recordShoppingTrip} from "../services/learning.js";
import {categorizeIngredientSync} from "../utils/categories.js";
import {categorizeBatchWithAI, client as ai} from "../services/ai.js";
import {aiRateLimiter} from "../middleware/ai-rate-limit.js";
import {posthog} from "../posthog.js";

const router = Router();
router.use(requireAuth);

// Helper: verify list belongs to the user's household
function verifyListOwnership(listId: string, householdId: string) {
  const list = db
    .select()
    .from(groceryList)
    .where(and(eq(groceryList.id, listId), eq(groceryList.householdId, householdId)))
    .get();
  return list ?? null;
}

// GET /current — Get or create the household's grocery list
router.get("/current", (req, res) => {
  const householdId = req.user!.householdId;

  let list = db
    .select()
    .from(groceryList)
    .where(eq(groceryList.householdId, householdId))
    .get();

  if (!list) {
    const id = crypto.randomUUID();
    db.insert(groceryList)
      .values({ id, householdId })
      .run();
    list = db.select().from(groceryList).where(eq(groceryList.id, id)).get()!;
  }

  const items = db
    .select()
    .from(groceryItem)
    .where(eq(groceryItem.groceryListId, list.id))
    .all();

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

// GET /:id — Get list with items grouped by category
router.get("/:id", (req, res) => {
  const householdId = req.user!.householdId;
  const listId = req.params.id;

  const list = verifyListOwnership(listId, householdId);
  if (!list) {
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

// PATCH /:id/items/:itemId — Update item status (check/skip) or category
router.patch("/:id/items/:itemId", (req, res) => {
  const householdId = req.user!.householdId;
  const { id: listId, itemId } = req.params;

  const isCategoryUpdate = req.body.category !== undefined;
  const isQuantityUpdate = req.body.quantity !== undefined;

  // Validate status update path
  let status: string | undefined;
  if (!isCategoryUpdate && !isQuantityUpdate) {
    if (req.body.status) {
      status = req.body.status;
    } else if (req.body.checked !== undefined) {
      status = req.body.checked ? "checked" : "pending";
    } else {
      res.status(400).json({ error: "status, checked, category, or quantity is required" });
      return;
    }

    if (!["pending", "checked", "skipped"].includes(status!)) {
      res.status(400).json({ error: "status must be 'pending', 'checked', or 'skipped'" });
      return;
    }
  }

  if (!verifyListOwnership(listId, householdId)) {
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

  if (isCategoryUpdate) {
    db.update(groceryItem)
      .set({ category: req.body.category })
      .where(eq(groceryItem.id, itemId))
      .run();
  } else if (isQuantityUpdate) {
    db.update(groceryItem)
      .set({ quantity: req.body.quantity })
      .where(eq(groceryItem.id, itemId))
      .run();
  } else {
    db.update(groceryItem)
      .set({
        status: status as "pending" | "checked" | "skipped",
        checkedBy: status === "checked" ? req.user!.userId : null,
        checkedAt: status === "checked" ? new Date().toISOString() : null,
      })
      .where(eq(groceryItem.id, itemId))
      .run();
  }

  const updated = db.select().from(groceryItem).where(eq(groceryItem.id, itemId)).get();
  res.json(updated);
});

// POST /:id/items — Add a manual item to the list
router.post("/:id/items", aiRateLimiter, async (req, res) => {
  const householdId = req.user!.householdId;
  const listId = req.params.id as string;
  const { name, quantity, unit, category } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  if (!verifyListOwnership(listId, householdId)) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  // Auto-categorize if no category provided
  let resolvedCategory = category;
  if (!resolvedCategory) {
    resolvedCategory = categorizeIngredientSync(name);
    if (!resolvedCategory) {
      const aiResult = await categorizeBatchWithAI([name.trim()], req.user!.userId);
      resolvedCategory = aiResult[name.trim()] || "Overig";
    }
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
      category: resolvedCategory,
      source: "manual",
      sortOrder: maxSort + 1,
    })
    .run();

  const created = db.select().from(groceryItem).where(eq(groceryItem.id, id)).get();
  posthog.capture({
    distinctId: req.user!.userId,
    event: "grocery item added",
    properties: { list_id: listId, item_name: name, category: resolvedCategory },
  });
  res.status(201).json(created);
});

// POST /:id/finalize — Record shopping trip and mark plan as completed
router.post("/:id/finalize", (req, res) => {
  const householdId = req.user!.householdId;
  const listId = req.params.id;

  if (!verifyListOwnership(listId, householdId)) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const itemsRecorded = recordShoppingTrip(listId, householdId);
  posthog.capture({
    distinctId: req.user!.userId,
    event: "shopping trip completed",
    properties: { list_id: listId, items_recorded: itemsRecorded },
  });
  res.json({ ok: true, itemsRecorded });
});

// DELETE /:id — Delete the entire grocery list
router.delete("/:id", (req, res) => {
  const householdId = req.user!.householdId;
  const listId = req.params.id;

  if (!verifyListOwnership(listId, householdId)) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  db.delete(groceryItem).where(eq(groceryItem.groceryListId, listId)).run();
  db.delete(groceryList).where(eq(groceryList.id, listId)).run();

  res.json({ ok: true });
});

// POST /:id/cleanup — AI-powered list cleanup
router.post("/:id/cleanup", aiRateLimiter, async (req, res) => {
  const householdId = req.user!.householdId;
  const listId = req.params.id as string;

  if (!verifyListOwnership(listId, householdId)) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const items = db.select().from(groceryItem)
    .where(eq(groceryItem.groceryListId, listId))
    .all();

  const itemList = items.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    category: i.category,
    source: i.source,
  }));

  const prompt = `Je bent een slimme boodschappenlijst-assistent. Schoon de volgende boodschappenlijst op.

Regels:
1. SAMENVOEGEN: Als hetzelfde product meerdere keren voorkomt, voeg ze samen (tel hoeveelheden op). Geef de IDs van items die verwijderd moeten worden (duplicaten).
2. BASISINGREDIËNTEN VERWIJDEREN: Verwijder basisingrediënten zoals zout, peper, olie, boter, suiker, water, bloem — MAAR ALLEEN als hun source "recipe" of "staple" is. Items met source "manual" zijn handmatig toegevoegd en moeten ALTIJD blijven.
3. HOEVEELHEDEN: Corrigeer onlogische hoeveelheden als dat nodig is.

Huidige lijst:
${JSON.stringify(itemList, null, 2)}

Antwoord ALLEEN met geldige JSON:
{
  "deleteIds": ["id1", "id2"],
  "updates": [
    { "id": "item-id", "quantity": 3, "unit": "stuk", "name": "nieuwe naam" }
  ],
  "summary": "Korte samenvatting van wat er is veranderd"
}`;

  try {
    const response = await (ai.messages.create as any)({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      posthogDistinctId: req.user!.userId,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "AI returned invalid response" });
      return;
    }

    const result = JSON.parse(jsonMatch[0]) as {
      deleteIds: string[];
      updates: Array<{ id: string; quantity?: number; unit?: string; name?: string }>;
      summary: string;
    };

    // Apply deletions
    for (const deleteId of result.deleteIds) {
      db.delete(groceryItem).where(
        and(eq(groceryItem.id, deleteId), eq(groceryItem.groceryListId, listId))
      ).run();
    }

    // Apply updates
    for (const update of result.updates) {
      const sets: Record<string, any> = {};
      if (update.quantity !== undefined) sets.quantity = update.quantity;
      if (update.unit !== undefined) sets.unit = update.unit;
      if (update.name !== undefined) sets.name = update.name;

      if (Object.keys(sets).length > 0) {
        db.update(groceryItem).set(sets)
          .where(and(eq(groceryItem.id, update.id), eq(groceryItem.groceryListId, listId)))
          .run();
      }
    }

    // Return updated list
    const updatedItems = db.select().from(groceryItem)
      .where(eq(groceryItem.groceryListId, listId))
      .all()
      .map((item) => ({
        ...item,
        checked: item.status === "checked",
        source: item.source === "staple" ? "basis" : item.source === "manual" ? "handmatig" : "recept",
      }));

    posthog.capture({
      distinctId: req.user!.userId,
      event: "grocery list cleaned up",
      properties: {
        list_id: listId,
        items_deleted: result.deleteIds.length,
        items_updated: result.updates.length,
      },
    });
    res.json({
      summary: result.summary,
      deleted: result.deleteIds.length,
      updated: result.updates.length,
      items: updatedItems,
    });
  } catch (err: any) {
    posthog.captureException(err, req.user!.userId, { list_id: listId });
    res.status(500).json({ error: `Cleanup failed: ${err.message}` });
  }
});

export default router;
