# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin panel with household approval flow, user management, system health monitoring, and Pushover notifications.

**Architecture:** Add a `status` column to the `organization` table to support waiting/active/deactivated states. New `/api/admin/*` routes protected by `requireAdmin` middleware (first user = admin). New `/api/register` public route for self-service household requests. Frontend gets `/admin`, `/register`, and `/waiting` pages. Pushover service for notifications on key events.

**Tech Stack:** Express, Drizzle ORM (SQLite), React, React Query, better-auth, Pushover API, Tailwind CSS.

---

## File Map

### Server — New Files
- `packages/server/src/middleware/admin.ts` — `requireAdmin` middleware (checks if user is first created user)
- `packages/server/src/routes/admin.ts` — Admin API routes (households, users, system health)
- `packages/server/src/routes/register.ts` — Public registration route for new households
- `packages/server/src/services/pushover.ts` — Pushover notification service

### Server — Modified Files
- `packages/server/src/db/auth-schema.ts` — Add `status` column to `organization` table
- `packages/server/src/middleware/auth.ts` — Check household status, block waiting/deactivated
- `packages/server/src/app.ts` — Register new routes
- `packages/server/src/routes/setup.ts` — Set status to `"active"` when creating first household
- `packages/server/src/jobs/scheduler.ts` — Add Pushover alerts on scraper failure + DB size check
- `packages/server/src/services/ai.ts` — Add in-memory API call counter
- `packages/server/src/db/schema.ts` — (no change needed, re-exports auth-schema)

### Client — New Files
- `packages/client/src/pages/Register.tsx` — Self-service household registration page
- `packages/client/src/pages/Admin.tsx` — Admin dashboard page
- `packages/client/src/pages/Waiting.tsx` — Waiting for approval page

### Client — Modified Files
- `packages/client/src/App.tsx` — Add new routes, household status redirect logic
- `packages/client/src/components/BottomNav.tsx` — Add admin nav item (conditional)
- `packages/client/src/hooks/useAuth.ts` — Expose `isAdmin` flag + household status
- `packages/client/src/api/client.ts` — Handle 403 HOUSEHOLD_PENDING/DEACTIVATED responses
- `packages/client/src/pages/Login.tsx` — Add "Toegang aanvragen" link to `/register`

---

### Task 1: Database Migration — Add `status` Column to Organization

**Files:**
- Modify: `packages/server/src/db/auth-schema.ts:97-108`

- [ ] **Step 1: Add `status` column to the organization table definition**

In `packages/server/src/db/auth-schema.ts`, modify the `organization` table to add a `status` column:

```typescript
export const organization = sqliteTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    metadata: text("metadata"),
    status: text("status", {
      enum: ["active", "waiting", "deactivated"],
    }).notNull().default("waiting"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);
```

- [ ] **Step 2: Generate the Drizzle migration**

Run:
```bash
cd packages/server && pnpm exec drizzle-kit generate
```

Expected: A new migration file in `packages/server/migrations/` like `0007_*.sql` containing `ALTER TABLE organization ADD COLUMN status`.

- [ ] **Step 3: Create a manual migration to set existing organizations to active**

After the Drizzle-generated migration, create a second SQL statement. Open the generated migration file and append:

```sql
UPDATE `organization` SET `status` = 'active' WHERE `status` = 'waiting';
```

This ensures all pre-existing households are active.

- [ ] **Step 4: Update the setup route to set status to "active"**

In `packages/server/src/routes/setup.ts`, modify the organization insert (line 47-52) to include status:

```typescript
  await db.insert(organization).values({
    id: orgId,
    name: householdName,
    slug: crypto.randomUUID().slice(0, 8),
    createdAt: now,
    status: "active",
  });
```

- [ ] **Step 5: Verify typecheck passes**

Run:
```bash
cd packages/server && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/auth-schema.ts packages/server/migrations/ packages/server/src/routes/setup.ts
git commit -m "feat: add status column to organization table"
```

---

### Task 2: Pushover Notification Service

**Files:**
- Create: `packages/server/src/services/pushover.ts`

- [ ] **Step 1: Create the Pushover service**

Create `packages/server/src/services/pushover.ts`:

```typescript
const PUSHOVER_API = "https://api.pushover.net/1/messages.json";

interface PushoverMessage {
  title: string;
  message: string;
  priority?: -2 | -1 | 0 | 1;
}

export async function sendPushoverNotification(msg: PushoverMessage): Promise<void> {
  const userKey = process.env.PUSHOVER_USER_KEY;
  const apiToken = process.env.PUSHOVER_API_TOKEN;

  if (!userKey || !apiToken) return;

  try {
    const res = await fetch(PUSHOVER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: apiToken,
        user: userKey,
        title: msg.title,
        message: msg.message,
        priority: msg.priority ?? 0,
      }),
    });

    if (!res.ok) {
      console.error("Pushover notification failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Pushover notification error:", err);
  }
}
```

- [ ] **Step 2: Update `.env.example`**

Add to the end of `.env.example`:

```env
# Pushover notifications (optional)
PUSHOVER_USER_KEY=
PUSHOVER_API_TOKEN=
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/pushover.ts .env.example
git commit -m "feat: add Pushover notification service"
```

---

### Task 3: Admin Middleware

**Files:**
- Create: `packages/server/src/middleware/admin.ts`

- [ ] **Step 1: Create the requireAdmin middleware**

Create `packages/server/src/middleware/admin.ts`:

```typescript
import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";
import { db } from "../db/connection.js";
import { user } from "../db/auth-schema.js";
import { sql } from "drizzle-orm";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // The admin is the first user ever created
    const firstUser = db
      .select({ id: user.id })
      .from(user)
      .orderBy(sql`${user.createdAt} ASC`)
      .limit(1)
      .get();

    if (!firstUser || firstUser.id !== session.user.id) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    req.user = {
      userId: session.user.id,
      householdId: (session.session as any).activeOrganizationId || "",
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
cd packages/server && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/middleware/admin.ts
git commit -m "feat: add requireAdmin middleware"
```

---

### Task 4: Household Status Check in Auth Middleware

**Files:**
- Modify: `packages/server/src/middleware/auth.ts`

- [ ] **Step 1: Add household status check to requireAuth**

Replace the entire content of `packages/server/src/middleware/auth.ts`:

```typescript
import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";
import { db } from "../db/connection.js";
import { organization } from "../db/auth-schema.js";
import { eq } from "drizzle-orm";

export interface AuthPayload {
  userId: string;
  householdId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const activeOrgId = (session.session as any).activeOrganizationId;

    // Check household status if user has an active organization
    if (activeOrgId) {
      const org = db
        .select({ status: organization.status })
        .from(organization)
        .where(eq(organization.id, activeOrgId))
        .get();

      if (org?.status === "waiting") {
        res.status(403).json({ error: "HOUSEHOLD_PENDING" });
        return;
      }

      if (org?.status === "deactivated") {
        res.status(403).json({ error: "HOUSEHOLD_DEACTIVATED" });
        return;
      }
    }

    req.user = {
      userId: session.user.id,
      householdId: activeOrgId || "",
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
cd packages/server && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/middleware/auth.ts
git commit -m "feat: check household status in requireAuth middleware"
```

---

### Task 5: Registration Route

**Files:**
- Create: `packages/server/src/routes/register.ts`
- Modify: `packages/server/src/app.ts:22,53`

- [ ] **Step 1: Create the registration route**

Create `packages/server/src/routes/register.ts`:

```typescript
import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/connection.js";
import { user, organization, member } from "../db/auth-schema.js";
import { count } from "drizzle-orm";
import { auth } from "../auth.js";
import { sendPushoverNotification } from "../services/pushover.js";

const router = Router();

router.get("/status", async (_req, res) => {
  // Registration is available as long as setup has been completed (at least 1 user exists)
  const [result] = await db.select({ count: count() }).from(user);
  res.json({ available: result.count > 0 });
});

router.post("/", async (req, res) => {
  const { name, householdName } = req.body;
  if (!name || !householdName) {
    res.status(400).json({ error: "Naam en huishoudnaam zijn verplicht" });
    return;
  }

  // Make sure setup has been completed first
  const [userCount] = await db.select({ count: count() }).from(user);
  if (userCount.count === 0) {
    res.status(400).json({ error: "App is nog niet geconfigureerd" });
    return;
  }

  const email = `${crypto.randomUUID()}@passkey.local`;
  const password = crypto.randomBytes(32).toString("hex");

  // Create user via better-auth API
  const signUpResponse = await auth.api.signUpEmail({
    body: { email, password, name },
  });

  if (!signUpResponse?.user) {
    res.status(500).json({ error: "Kon gebruiker niet aanmaken" });
    return;
  }

  // Create organization with "waiting" status
  const orgId = crypto.randomUUID();
  const now = new Date();

  await db.insert(organization).values({
    id: orgId,
    name: householdName,
    slug: crypto.randomUUID().slice(0, 8),
    createdAt: now,
    status: "waiting",
  });

  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId: signUpResponse.user.id,
    role: "owner",
    createdAt: now,
  });

  // Sign in via better-auth to get proper cookies
  const signInRequest = new Request("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const authResponse = await auth.handler(signInRequest);

  // Forward Set-Cookie headers
  const setCookies = authResponse.headers.getSetCookie();
  for (const cookie of setCookies) {
    res.append("Set-Cookie", cookie);
  }

  // Send Pushover notification (fire-and-forget)
  sendPushoverNotification({
    title: "Nieuw huishouden",
    message: `Nieuw huishouden wil toegang: ${householdName} (door ${name})`,
  }).catch(() => {});

  res.json({ success: true, userId: signUpResponse.user.id });
});

export default router;
```

- [ ] **Step 2: Register the route in app.ts**

In `packages/server/src/app.ts`, add the import after line 22 (the `websiteRoutes` import):

```typescript
import registerRoutes from "./routes/register.js";
```

Add the route mount after line 53 (after the `recoveryRoutes` mount), before the other protected routes:

```typescript
app.use("/api/register", registerRoutes);
```

- [ ] **Step 3: Verify typecheck passes**

Run:
```bash
cd packages/server && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/register.ts packages/server/src/app.ts
git commit -m "feat: add self-service household registration route"
```

---

### Task 6: Admin API Routes

**Files:**
- Create: `packages/server/src/routes/admin.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create the admin routes file**

Create `packages/server/src/routes/admin.ts`:

```typescript
import { Router } from "express";
import { db, sqlite } from "../db/connection.js";
import {
  organization,
  member,
  user,
  session,
  account,
  passkey,
} from "../db/auth-schema.js";
import {
  recipe,
  weeklyPlan,
  weeklyPlanRecipe,
  groceryList,
  groceryItem,
  weeklyStaple,
  storeConfig,
  cachedSuggestion,
  favoriteWebsite,
  shoppingHistory,
} from "../db/schema.js";
import { eq, sql, desc, and, count } from "drizzle-orm";
import { requireAdmin } from "../middleware/admin.js";
import { getAICallCount } from "../services/ai.js";
import { statSync } from "node:fs";

const router = Router();
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
    const [memberCount] = db
      .select({ count: count() })
      .from(member)
      .where(eq(member.organizationId, h.id));

    const [recipeCount] = db
      .select({ count: count() })
      .from(recipe)
      .where(eq(recipe.householdId, h.id));

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
    const [otherMemberships] = db
      .select({ count: count() })
      .from(member)
      .where(eq(member.userId, m.userId));

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
```

- [ ] **Step 2: Register admin routes in app.ts**

In `packages/server/src/app.ts`, add the import (after the other route imports):

```typescript
import adminRoutes from "./routes/admin.js";
```

Add the route mount (after the other `app.use` route lines):

```typescript
app.use("/api/admin", adminRoutes);
```

- [ ] **Step 3: Verify typecheck passes**

Run:
```bash
cd packages/server && pnpm run typecheck
```

Expected: No errors (note: `getAICallCount` will be added in Task 7, so this may fail until then — if running sequentially, you can skip this check and verify after Task 7).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/admin.ts packages/server/src/app.ts
git commit -m "feat: add admin API routes for households, users, and system health"
```

---

### Task 7: AI Call Counter

**Files:**
- Modify: `packages/server/src/services/ai.ts`

- [ ] **Step 1: Add an in-memory counter to the AI service**

In `packages/server/src/services/ai.ts`, add a counter variable after the client initialization (line 4) and a getter function, and increment in the existing function:

Add after `const client = new Anthropic();` (line 4):

```typescript
let aiCallCount = 0;

export function getAICallCount(): number {
  return aiCallCount;
}
```

Add as the first line inside the `categorizeBatchWithAI` function body (after `if (ingredientNames.length === 0) return {};`):

```typescript
  aiCallCount++;
```

So the increment goes right before `const response = await client.messages.create(...)`.

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
cd packages/server && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/ai.ts
git commit -m "feat: add in-memory AI API call counter"
```

---

### Task 8: Pushover Alerts in Scheduler

**Files:**
- Modify: `packages/server/src/jobs/scheduler.ts`

- [ ] **Step 1: Add Pushover notifications for scraper failures and DB size**

Replace the entire content of `packages/server/src/jobs/scheduler.ts`:

```typescript
import { schedule } from "node-cron";
import { db } from "../db/connection.js";
import { productDiscount, cachedSuggestion } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { refreshAllDiscounts } from "../services/discounts.js";
import { refreshAllCachedSuggestions } from "../services/recommendations.js";
import { sendPushoverNotification } from "../services/pushover.js";
import { statSync } from "node:fs";

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
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
cd packages/server && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/jobs/scheduler.ts
git commit -m "feat: add Pushover alerts for scraper failures and DB size"
```

---

### Task 9: Frontend — API Client Household Status Handling

**Files:**
- Modify: `packages/client/src/api/client.ts`

- [ ] **Step 1: Handle 403 with household status errors**

Replace the entire content of `packages/client/src/api/client.ts`:

```typescript
import { API_BASE } from "../lib/constants.js";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "HOUSEHOLD_PENDING") {
      window.location.href = "/waiting";
      throw new Error("Household pending approval");
    }
    if (body.error === "HOUSEHOLD_DEACTIVATED") {
      window.location.href = "/waiting";
      throw new Error("Household deactivated");
    }
    throw new Error(body.error || "Forbidden");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/api/client.ts
git commit -m "feat: handle household pending/deactivated status in API client"
```

---

### Task 10: Frontend — useAuth Hook Updates

**Files:**
- Modify: `packages/client/src/hooks/useAuth.ts`

- [ ] **Step 1: Add isAdmin check and household status to useAuth**

Replace the entire content of `packages/client/src/hooks/useAuth.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client.js";
import { apiFetch } from "../api/client.js";

export function useAuth() {
  const session = authClient.useSession();
  const activeOrg = authClient.useActiveOrganization();

  const { data: adminStatus } = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => apiFetch<{ isAdmin: boolean }>("/api/admin/status"),
    enabled: !!session.data?.session,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user: session.data?.user || null,
    household: activeOrg.data || null,
    loading: session.isPending,
    authenticated: !!session.data?.session,
    isAdmin: adminStatus?.isAdmin ?? false,
    signOut: authClient.signOut,
    createOrganization: authClient.organization.create,
    setActiveOrganization: authClient.organization.setActive,
  };
}
```

- [ ] **Step 2: Add the `/api/admin/status` endpoint on the server**

In `packages/server/src/routes/admin.ts`, add a status check route **before** the `router.use(requireAdmin)` line. This route uses its own lighter auth check:

Add at the top of the router (after `const router = Router();` but before `router.use(requireAdmin);`):

```typescript
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
```

Move the `requireAdmin` middleware call after the status route so `/status` is accessible to all authenticated users.

- [ ] **Step 3: Verify typecheck passes**

Run:
```bash
cd packages/server && pnpm run typecheck && cd ../client && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/hooks/useAuth.ts packages/server/src/routes/admin.ts
git commit -m "feat: add isAdmin to useAuth hook with server status endpoint"
```

---

### Task 11: Frontend — Waiting Page

**Files:**
- Create: `packages/client/src/pages/Waiting.tsx`

- [ ] **Step 1: Create the Waiting page**

Create `packages/client/src/pages/Waiting.tsx`:

```tsx
import { useAuth } from "../hooks/useAuth.js";
import { useNavigate } from "react-router-dom";

export default function Waiting() {
  const { authenticated, loading, household } = useAuth();
  const navigate = useNavigate();

  const handleRefresh = () => {
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ios-secondary">
        Laden...
      </div>
    );
  }

  if (!authenticated) {
    navigate("/login", { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="text-6xl">⏳</div>
        <h1 className="text-[22px] font-bold text-ios-label">
          Wachten op goedkeuring
        </h1>
        <p className="text-[15px] text-ios-secondary">
          Je huishouden{household ? ` "${household.name}"` : ""} is aangemeld en
          wacht op goedkeuring van de beheerder.
        </p>
        <button
          onClick={handleRefresh}
          className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white"
        >
          Opnieuw controleren
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/pages/Waiting.tsx
git commit -m "feat: add Waiting page for pending household approval"
```

---

### Task 12: Frontend — Register Page

**Files:**
- Create: `packages/client/src/pages/Register.tsx`

- [ ] **Step 1: Create the Register page**

Create `packages/client/src/pages/Register.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";

export default function Register() {
  const [name, setName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "passkey">("form");
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!name.trim() || !householdName.trim()) {
      setError("Vul alle velden in");
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Create user + waiting household
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), householdName: householdName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registratie mislukt");

      // Set active organization
      const orgs = await authClient.organization.list();
      if (orgs.data && orgs.data.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs.data[0].id });
      }

      setStep("passkey");
    } catch (err: any) {
      setError(err.message || "Registratie mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySetup = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.passkey.addPasskey();
      if (result?.error) throw new Error(String(result.error.message || "Passkey instellen mislukt"));
      navigate("/waiting");
    } catch (err: any) {
      setError(err.message || "Passkey instellen mislukt");
      // Still navigate to waiting — they can set up passkey later via recovery
      navigate("/waiting");
    } finally {
      setLoading(false);
    }
  };

  if (step === "passkey") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-ios-label">Passkey instellen</h1>
            <p className="mt-2 text-[15px] text-ios-secondary">
              Stel een passkey in zodat je later kunt inloggen.
            </p>
          </div>

          <button
            onClick={handlePasskeySetup}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Passkey instellen"}
          </button>

          {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Weekboodschappen</h1>
          <p className="mt-1 text-[13px] text-ios-secondary">Toegang aanvragen</p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Je naam"
            className="w-full rounded-[12px] bg-ios-grouped-bg px-4 py-3 text-[15px] text-ios-label placeholder:text-ios-secondary"
          />
          <input
            type="text"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            placeholder="Naam van je huishouden"
            className="w-full rounded-[12px] bg-ios-grouped-bg px-4 py-3 text-[15px] text-ios-label placeholder:text-ios-secondary"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Aanvragen"}
        </button>

        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}

        <button
          onClick={() => navigate("/login")}
          className="w-full text-center text-[13px] text-ios-secondary"
        >
          Al een account? Inloggen
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/pages/Register.tsx
git commit -m "feat: add Register page for self-service household requests"
```

---

### Task 13: Frontend — Admin Page

**Files:**
- Create: `packages/client/src/pages/Admin.tsx`

- [ ] **Step 1: Create the Admin page**

Create `packages/client/src/pages/Admin.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client.js";
import { Shield, Users, Activity, ChevronDown, ChevronUp, Trash2, RotateCcw } from "lucide-react";

interface HouseholdMember {
  id: string;
  name: string;
  role: string;
}

interface Household {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  memberCount: number;
  recipeCount: number;
  lastActivity: string | null;
  members: HouseholdMember[];
}

interface UserMembership {
  organizationId: string;
  role: string;
  householdName: string;
}

interface AdminUser {
  id: string;
  name: string;
  createdAt: number;
  memberships: UserMembership[];
  lastLogin: number | null;
}

interface SystemHealth {
  dbSizeBytes: number;
  dbSizeMB: number;
  discountLastRefresh: string | null;
  aiCallCount: number;
}

export default function Admin() {
  const queryClient = useQueryClient();
  const [expandedHousehold, setExpandedHousehold] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: households = [], isLoading: loadingHouseholds } = useQuery({
    queryKey: ["admin-households"],
    queryFn: () => apiFetch<Household[]>("/api/admin/households"),
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch<AdminUser[]>("/api/admin/users"),
  });

  const { data: system } = useQuery({
    queryKey: ["admin-system"],
    queryFn: () => apiFetch<SystemHealth>("/api/admin/system"),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/admin/households/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-households"] });
    },
  });

  const deleteHousehold = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/households/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-households"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
    },
  });

  const resetPasskey = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/users/${id}/reset-passkey`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const removeMembership = useMutation({
    mutationFn: ({ userId, orgId }: { userId: string; orgId: string }) =>
      apiFetch(`/api/admin/users/${userId}/membership/${orgId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-households"] });
    },
  });

  const pendingHouseholds = households.filter((h) => h.status === "waiting");
  const otherHouseholds = households.filter((h) => h.status !== "waiting");

  const timeAgo = (date: number | string | null) => {
    if (!date) return "Nooit";
    const ms = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m geleden`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}u geleden`;
    const days = Math.floor(hours / 24);
    return `${days}d geleden`;
  };

  if (loadingHouseholds || loadingUsers) {
    return (
      <div className="flex h-full items-center justify-center text-ios-secondary">
        Laden...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      <div className="flex items-center gap-2">
        <Shield size={20} strokeWidth={1.5} />
        <h1 className="text-[22px] font-bold text-ios-label">Admin</h1>
      </div>

      {/* Pending Approval */}
      {pendingHouseholds.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-ios-label">
              Wachten op goedkeuring
            </h2>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[13px] font-medium text-amber-500">
              {pendingHouseholds.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingHouseholds.map((h) => (
              <div
                key={h.id}
                className="rounded-[12px] bg-ios-grouped-bg p-3"
              >
                <div className="mb-2">
                  <div className="font-medium text-ios-label">{h.name}</div>
                  <div className="text-[12px] text-ios-secondary">
                    {timeAgo(h.createdAt)} · {h.memberCount} {h.memberCount === 1 ? "lid" : "leden"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus.mutate({ id: h.id, status: "active" })}
                    disabled={updateStatus.isPending}
                    className="flex-1 rounded-[10px] bg-green-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    Goedkeuren
                  </button>
                  <button
                    onClick={() => deleteHousehold.mutate(h.id)}
                    disabled={deleteHousehold.isPending}
                    className="flex-1 rounded-[10px] bg-ios-destructive px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    Afwijzen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Households */}
      <section>
        <h2 className="mb-2 text-[17px] font-semibold text-ios-label">
          Huishoudens ({otherHouseholds.length})
        </h2>
        <div className="space-y-2">
          {otherHouseholds.map((h) => (
            <div
              key={h.id}
              className={`rounded-[12px] bg-ios-grouped-bg ${h.status === "deactivated" ? "opacity-50" : ""}`}
            >
              <button
                onClick={() =>
                  setExpandedHousehold(expandedHousehold === h.id ? null : h.id)
                }
                className="flex w-full items-center justify-between p-3 text-left"
              >
                <div>
                  <div className="font-medium text-ios-label">{h.name}</div>
                  <div className="text-[12px] text-ios-secondary">
                    {h.memberCount} {h.memberCount === 1 ? "lid" : "leden"} ·{" "}
                    {h.recipeCount} recepten · Actief: {timeAgo(h.lastActivity)}
                  </div>
                </div>
                {expandedHousehold === h.id ? (
                  <ChevronUp size={16} className="text-ios-secondary" />
                ) : (
                  <ChevronDown size={16} className="text-ios-secondary" />
                )}
              </button>

              {expandedHousehold === h.id && (
                <div className="border-t border-ios-separator px-3 pb-3 pt-2">
                  <div className="mb-2 text-[13px] text-ios-secondary">Leden:</div>
                  {h.members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-1 text-[13px]"
                    >
                      <span className="text-ios-label">{m.name}</span>
                      <span className="text-ios-secondary">{m.role}</span>
                    </div>
                  ))}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        updateStatus.mutate({
                          id: h.id,
                          status: h.status === "active" ? "deactivated" : "active",
                        })
                      }
                      disabled={updateStatus.isPending}
                      className="flex-1 rounded-[10px] bg-ios-grouped-bg border border-ios-separator px-3 py-2 text-[13px] font-medium text-ios-label disabled:opacity-50"
                    >
                      {h.status === "active" ? "Deactiveren" : "Activeren"}
                    </button>
                    {confirmDelete === h.id ? (
                      <button
                        onClick={() => deleteHousehold.mutate(h.id)}
                        disabled={deleteHousehold.isPending}
                        className="flex-1 rounded-[10px] bg-ios-destructive px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        Bevestigen
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(h.id)}
                        className="rounded-[10px] px-3 py-2 text-[13px] text-ios-destructive"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Users */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Users size={16} strokeWidth={1.5} />
          <h2 className="text-[17px] font-semibold text-ios-label">
            Gebruikers ({users.length})
          </h2>
        </div>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-[12px] bg-ios-grouped-bg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-ios-label">{u.name}</div>
                  <div className="text-[12px] text-ios-secondary">
                    {u.memberships.map((m) => m.householdName).join(", ") || "Geen huishouden"}{" "}
                    · Laatst ingelogd: {timeAgo(u.lastLogin)}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => resetPasskey.mutate(u.id)}
                  disabled={resetPasskey.isPending}
                  className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] text-ios-secondary"
                >
                  <RotateCcw size={12} /> Reset passkey
                </button>
                {u.memberships.map((m) => (
                  <button
                    key={m.organizationId}
                    onClick={() =>
                      removeMembership.mutate({
                        userId: u.id,
                        orgId: m.organizationId,
                      })
                    }
                    disabled={removeMembership.isPending}
                    className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] text-ios-destructive"
                  >
                    <Trash2 size={12} /> {m.householdName}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* System Health */}
      {system && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Activity size={16} strokeWidth={1.5} />
            <h2 className="text-[17px] font-semibold text-ios-label">Systeem</h2>
          </div>
          <div className="rounded-[12px] bg-ios-grouped-bg p-3 text-[13px] text-ios-label">
            <div className="flex justify-between py-1">
              <span className="text-ios-secondary">Database</span>
              <span>{system.dbSizeMB} MB</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ios-secondary">Kortingen vernieuwd</span>
              <span>
                {system.discountLastRefresh
                  ? new Date(system.discountLastRefresh).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Nooit"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ios-secondary">AI-aanroepen</span>
              <span>{system.aiCallCount}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/pages/Admin.tsx
git commit -m "feat: add Admin dashboard page"
```

---

### Task 14: Frontend — Routing & Navigation Updates

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/BottomNav.tsx`
- Modify: `packages/client/src/pages/Login.tsx`

- [ ] **Step 1: Update App.tsx to add new routes**

Replace the entire content of `packages/client/src/App.tsx`:

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth.js";
import Layout from "./components/Layout.js";
import MealPlanner from "./pages/MealPlanner.js";
import GroceryList from "./pages/GroceryList.js";
import ShoppingMode from "./pages/ShoppingMode.js";
import Staples from "./pages/Staples.js";
import Recipes from "./pages/Recipes.js";
import RecipeDetail from "./pages/RecipeDetail.js";
import Settings from "./pages/Settings.js";
import Login from "./pages/Login.js";
import Setup from "./pages/Setup.js";
import Invite from "./pages/Invite.js";
import Recover from "./pages/Recover.js";
import Register from "./pages/Register.js";
import Waiting from "./pages/Waiting.js";
import Admin from "./pages/Admin.js";
import NotFound from "./pages/NotFound.js";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-ios-secondary">Laden...</div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/recover/:token" element={<Recover />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/waiting"
        element={
          <ProtectedRoute>
            <Waiting />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/planner" replace />} />
        <Route path="/planner" element={<MealPlanner />} />
        <Route path="/list" element={<GroceryList />} />
        <Route path="/shop" element={<ShoppingMode />} />
        <Route path="/staples" element={<Staples />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Update BottomNav.tsx to show admin link conditionally**

Replace the entire content of `packages/client/src/components/BottomNav.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { Calendar, ClipboardCheck, BookOpen, ShoppingCart, Settings, Shield } from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";

const navItems = [
  { to: "/planner", label: "Plan", icon: Calendar },
  { to: "/list", label: "Lijst", icon: ClipboardCheck },
  { to: "/recipes", label: "Recepten", icon: BookOpen },
  { to: "/staples", label: "Basis", icon: ShoppingCart },
  { to: "/settings", label: "Instellingen", icon: Settings },
];

export default function BottomNav() {
  const { isAdmin } = useAuth();

  const items = isAdmin
    ? [...navItems, { to: "/admin", label: "Admin", icon: Shield }]
    : navItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-ios-separator bg-[rgba(249,249,249,0.94)] backdrop-blur-[20px]"
         style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
      <div className="mx-auto flex max-w-lg justify-around">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 pt-2 pb-1 text-[10px] font-medium ${
                isActive ? "text-accent" : "text-ios-secondary"
              }`
            }
          >
            <item.icon size={24} strokeWidth={1.5} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Add "Toegang aanvragen" link to Login page**

In `packages/client/src/pages/Login.tsx`, add a link to `/register` at the bottom of the page. Add this right before the closing `</div>` of the outer `w-full max-w-sm` div (after the recovery section, around line 117):

```tsx
        <button
          onClick={() => navigate("/register")}
          className="w-full text-center text-[13px] text-accent"
        >
          Nog geen account? Toegang aanvragen
        </button>
```

- [ ] **Step 4: Verify client typecheck passes**

Run:
```bash
cd packages/client && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/components/BottomNav.tsx packages/client/src/pages/Login.tsx
git commit -m "feat: add admin, register, and waiting routes with navigation updates"
```

---

### Task 15: Final Verification

- [ ] **Step 1: Run full server typecheck**

Run:
```bash
cd packages/server && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 2: Run full client typecheck**

Run:
```bash
cd packages/client && pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Run the build**

Run:
```bash
cd /Users/dennis/Personal/weekboodschappen && pnpm run build
```

Expected: Successful build with no errors.

- [ ] **Step 4: Verify migration generates properly**

Run:
```bash
cd packages/server && pnpm exec drizzle-kit generate --name add-org-status
```

Check that the migration exists and has the correct ALTER TABLE statement.
