import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/connection.js";
import { user, account, invitation, member, session, organization } from "../db/auth-schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Create invite — authenticated
router.post("/create", requireAuth, async (req, res) => {
  if (!req.user?.householdId) {
    res.status(400).json({ error: "No active household" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(invitation).values({
    id: token,
    organizationId: req.user.householdId,
    email: "invite@pending.local",
    role: "member",
    status: "pending",
    expiresAt,
    createdAt: now,
    inviterId: req.user.userId,
  });

  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  res.json({ token, url: `${baseUrl}/invite/${token}` });
});

// Validate invite — public
router.get("/:token", async (req, res) => {
  const [invite] = await db
    .select({
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      orgName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .where(eq(invitation.id, req.params.token));

  if (!invite) {
    res.status(404).json({ valid: false, error: "Uitnodiging niet gevonden" });
    return;
  }

  if (invite.status !== "pending") {
    res.status(410).json({ valid: false, error: "Uitnodiging is al gebruikt" });
    return;
  }

  if (invite.expiresAt < new Date()) {
    res.status(410).json({ valid: false, error: "Uitnodiging is verlopen" });
    return;
  }

  res.json({ valid: true, householdName: invite.orgName });
});

// Accept invite — public
router.post("/:token/accept", async (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const [invite] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.id, req.params.token),
        eq(invitation.status, "pending"),
      ),
    );

  if (!invite) {
    res.status(404).json({ error: "Uitnodiging niet gevonden of al gebruikt" });
    return;
  }

  if (invite.expiresAt < new Date()) {
    res.status(410).json({ error: "Uitnodiging is verlopen" });
    return;
  }

  const userId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

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

  await db.insert(member).values({
    id: memberId,
    organizationId: invite.organizationId,
    userId,
    role: "member",
    createdAt: now,
  });

  await db.insert(session).values({
    id: sessionId,
    token: sessionToken,
    userId,
    expiresAt,
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: invite.organizationId,
  });

  await db.update(invitation)
    .set({ status: "accepted" })
    .where(eq(invitation.id, req.params.token));

  res.setHeader(
    "Set-Cookie",
    `better-auth.session_token=${sessionToken};Path=/;HttpOnly;SameSite=Lax;Max-Age=${30 * 24 * 60 * 60}`,
  );
  res.json({ success: true, userId });
});

export default router;
