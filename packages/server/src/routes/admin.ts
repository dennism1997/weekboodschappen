import {Router} from "express";
import {db} from "../db/connection.js";
import {member, organization, passkey, session, user,} from "../db/auth-schema.js";
import {
    cachedSuggestion,
    favoriteWebsite,
    groceryItem,
    groceryList,
    recipe,
    shoppingHistory,
    storeConfig,
    weeklyPlan,
    weeklyPlanRecipe,
    weeklyStaple,
} from "../db/schema.js";
import {and, count, desc, eq, sql} from "drizzle-orm";
import {requireAdmin} from "../middleware/admin.js";
import {getAICallCount} from "../services/ai.js";
import {statSync} from "node:fs";

const router = Router();

// Public (auth-only) endpoint to check if current user is admin
router.get("/status", async (req, res) => {
  const { fromNodeHeaders } = await import("better-auth/node");
  const { auth } = await import("../auth.js");

  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session?.session) {
    res.json({ isAdmin: false });
    return;
  }

  const firstUser = db
    .select({ id: user.id })
    .from(user)
    .orderBy(sql`${user.createdAt} ASC`)
    .limit(1)
    .get();

  res.json({ isAdmin: firstUser?.id === session.user.id });
});

router.use(requireAdmin);

// --- Households ---

router.get("/households", async (_req, res) => {
  const households = db
    .select({
      id: organization.id,
      name: organization.name,
      status: organization.status,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .orderBy(desc(organization.createdAt))
    .all();

  // Enrich with member count, recipe count, and last activity
  const enriched = households.map((h) => {
    const memberCount = db
      .select({ count: count() })
      .from(member)
      .where(eq(member.organizationId, h.id))
      .get()!;

    const recipeCount = db
      .select({ count: count() })
      .from(recipe)
      .where(eq(recipe.householdId, h.id))
      .get()!;

    const lastPlan = db
      .select({ createdAt: weeklyPlan.createdAt })
      .from(weeklyPlan)
      .where(eq(weeklyPlan.householdId, h.id))
      .orderBy(desc(weeklyPlan.createdAt))
      .limit(1)
      .get();

    const members = db
      .select({
        id: user.id,
        name: user.name,
        role: member.role,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, h.id))
      .all();

    return {
      ...h,
      memberCount: memberCount.count,
      recipeCount: recipeCount.count,
      lastActivity: lastPlan?.createdAt ?? null,
      members,
    };
  });

  res.json(enriched);
});

router.patch("/households/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "waiting", "deactivated"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const org = db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, id))
    .get();

  if (!org) {
    res.status(404).json({ error: "Household not found" });
    return;
  }

  db.update(organization)
    .set({ status })
    .where(eq(organization.id, id))
    .run();

  res.json({ success: true });
});

router.delete("/households/:id", async (req, res) => {
  const { id } = req.params;

  const org = db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, id))
    .get();

  if (!org) {
    res.status(404).json({ error: "Household not found" });
    return;
  }

  // Delete all household data in correct order (respecting FK constraints)
  // 1. Get all plans for this household
  const plans = db
    .select({ id: weeklyPlan.id })
    .from(weeklyPlan)
    .where(eq(weeklyPlan.householdId, id))
    .all();

  for (const plan of plans) {
    // Delete grocery items via grocery lists
    const lists = db
      .select({ id: groceryList.id })
      .from(groceryList)
      .where(eq(groceryList.weeklyPlanId, plan.id))
      .all();

    for (const list of lists) {
      // Delete shopping history that references these grocery items
      const items = db
        .select({ id: groceryItem.id })
        .from(groceryItem)
        .where(eq(groceryItem.groceryListId, list.id))
        .all();

      for (const item of items) {
        db.delete(shoppingHistory)
          .where(eq(shoppingHistory.groceryItemId, item.id))
          .run();
      }

      db.delete(groceryItem).where(eq(groceryItem.groceryListId, list.id)).run();
    }

    db.delete(groceryList).where(eq(groceryList.weeklyPlanId, plan.id)).run();
    db.delete(weeklyPlanRecipe).where(eq(weeklyPlanRecipe.weeklyPlanId, plan.id)).run();
  }

  // 2. Delete plans, recipes, staples, configs, suggestions, websites
  db.delete(weeklyPlan).where(eq(weeklyPlan.householdId, id)).run();
  db.delete(recipe).where(eq(recipe.householdId, id)).run();
  db.delete(weeklyStaple).where(eq(weeklyStaple.householdId, id)).run();
  db.delete(storeConfig).where(eq(storeConfig.householdId, id)).run();
  db.delete(cachedSuggestion).where(eq(cachedSuggestion.householdId, id)).run();
  db.delete(favoriteWebsite).where(eq(favoriteWebsite.householdId, id)).run();

  // 3. Delete members and their users (if they only belong to this household)
  const householdMembers = db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, id))
    .all();

  // Delete the organization (cascades to members via FK)
  db.delete(organization).where(eq(organization.id, id)).run();

  // Delete users who no longer belong to any household
  for (const m of householdMembers) {
    const otherMemberships = db
      .select({ count: count() })
      .from(member)
      .where(eq(member.userId, m.userId))
      .get()!;

    if (otherMemberships.count === 0) {
      // This cascades to sessions, accounts, passkeys via FK
      db.delete(user).where(eq(user.id, m.userId)).run();
    }
  }

  res.json({ success: true });
});

// --- Users ---

router.get("/users", async (_req, res) => {
  const users = db
    .select({
      id: user.id,
      name: user.name,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .all();

  const enriched = users.map((u) => {
    const memberships = db
      .select({
        organizationId: member.organizationId,
        role: member.role,
        householdName: organization.name,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, u.id))
      .all();

    const lastSession = db
      .select({ createdAt: session.createdAt })
      .from(session)
      .where(eq(session.userId, u.id))
      .orderBy(desc(session.createdAt))
      .limit(1)
      .get();

    return {
      ...u,
      memberships,
      lastLogin: lastSession?.createdAt ?? null,
    };
  });

  res.json(enriched);
});

router.post("/users/:id/reset-passkey", async (req, res) => {
  const { id } = req.params;

  const targetUser = db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, id))
    .get();

  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  db.delete(passkey).where(eq(passkey.userId, id)).run();

  res.json({ success: true });
});

router.delete("/users/:id/membership/:orgId", async (req, res) => {
  const { id, orgId } = req.params;

  db.delete(member)
    .where(and(eq(member.userId, id), eq(member.organizationId, orgId)))
    .run();

  res.json({ success: true });
});

// --- System ---

router.get("/system", async (_req, res) => {
  // Database size
  const dbPath = process.env.DATABASE_PATH || "./data/weekboodschappen.db";
  let dbSizeBytes = 0;
  try {
    dbSizeBytes = statSync(dbPath).size;
  } catch {
    // File may not exist in some edge cases
  }

  // Discount scraper last run
  const latestDiscount = db
    .select({ fetchedAt: sql<string>`MAX(fetched_at)` })
    .from(sql`product_discount`)
    .get() as { fetchedAt: string | null } | undefined;

  // AI call count
  const aiCallCount = getAICallCount();

  res.json({
    dbSizeBytes,
    dbSizeMB: Math.round((dbSizeBytes / 1024 / 1024) * 10) / 10,
    discountLastRefresh: latestDiscount?.fetchedAt ?? null,
    aiCallCount,
  });
});

export default router;
