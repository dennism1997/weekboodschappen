import { Router } from "express";
import { db } from "../db/connection.js";
import { favoriteWebsite } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET / — List all favorite websites
router.get("/", (req, res) => {
  const websites = db
    .select()
    .from(favoriteWebsite)
    .where(eq(favoriteWebsite.householdId, req.user!.householdId))
    .all();

  res.json(websites);
});

// POST / — Add a favorite website
router.post("/", (req, res) => {
  const { url, name } = req.body;

  if (!url || !name) {
    res.status(400).json({ error: "url and name are required" });
    return;
  }

  const id = crypto.randomUUID();
  db.insert(favoriteWebsite)
    .values({
      id,
      householdId: req.user!.householdId,
      url: url.trim(),
      name: name.trim(),
    })
    .run();

  const saved = db.select().from(favoriteWebsite).where(eq(favoriteWebsite.id, id)).get();
  res.status(201).json(saved);
});

// DELETE /:id — Remove a favorite website
router.delete("/:id", (req, res) => {
  const existing = db
    .select()
    .from(favoriteWebsite)
    .where(
      and(
        eq(favoriteWebsite.id, req.params.id),
        eq(favoriteWebsite.householdId, req.user!.householdId),
      ),
    )
    .get();

  if (!existing) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  db.delete(favoriteWebsite).where(eq(favoriteWebsite.id, req.params.id)).run();
  res.json({ ok: true });
});

export default router;
