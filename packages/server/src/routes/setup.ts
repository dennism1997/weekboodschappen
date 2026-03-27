import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/connection.js";
import { user, account, organization, member, session } from "../db/auth-schema.js";
import { count } from "drizzle-orm";

const router = Router();

router.get("/status", async (_req, res) => {
  const [result] = await db.select({ count: count() }).from(user);
  res.json({ needsSetup: result.count === 0 });
});

router.post("/", async (req, res) => {
  const { name, householdName } = req.body;
  if (!name || !householdName) {
    res.status(400).json({ error: "Name and household name are required" });
    return;
  }

  const [result] = await db.select({ count: count() }).from(user);
  if (result.count > 0) {
    res.status(403).json({ error: "Setup already completed" });
    return;
  }

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(user).values({
    id: userId,
    name,
    email: `${userId}@passkey.local`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(organization).values({
    id: orgId,
    name: householdName,
    slug: crypto.randomUUID().slice(0, 8),
    createdAt: now,
  });

  await db.insert(member).values({
    id: memberId,
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: now,
  });

  await db.insert(session).values({
    id: sessionId,
    token: sessionToken,
    userId,
    expiresAt,
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: orgId,
  });

  res.setHeader(
    "Set-Cookie",
    `better-auth.session_token=${sessionToken};Path=/;HttpOnly;SameSite=Lax;Max-Age=${30 * 24 * 60 * 60}`,
  );
  res.json({ success: true, userId });
});

export default router;
