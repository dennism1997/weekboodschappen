import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/connection.js";
import { recoveryToken, passkey, user, member, account } from "../db/auth-schema.js";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { auth } from "../auth.js";
import { hashPassword } from "better-auth/crypto";

const router = Router();

// Create recovery token — authenticated, owner-only
router.post("/create", requireAuth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  if (!req.user?.householdId) {
    res.status(400).json({ error: "No active household" });
    return;
  }

  // Verify requester is owner of their household
  const [requesterMembership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, req.user.userId),
        eq(member.organizationId, req.user.householdId),
        eq(member.role, "owner"),
      ),
    );

  if (!requesterMembership) {
    res.status(403).json({ error: "Only household owners can create recovery tokens" });
    return;
  }

  // Verify target user is in the same household
  const [targetMembership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, req.user.householdId),
      ),
    );

  if (!targetMembership) {
    res.status(404).json({ error: "User not found in your household" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  await db.insert(recoveryToken).values({
    id: token,
    userId,
    type: "link",
    expiresAt,
    createdAt: now,
  });

  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  res.json({ token, url: `${baseUrl}/recover/${token}` });
});

// Admin recovery — protected by BETTER_AUTH_SECRET
router.post("/admin", async (req, res) => {
  const { secret, userId } = req.body;

  if (secret !== process.env.BETTER_AUTH_SECRET) {
    res.status(403).json({ error: "Invalid secret" });
    return;
  }

  // If no userId, list all users
  if (!userId) {
    const users = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user);

    res.json({ users });
    return;
  }

  // Create recovery token for specified user
  const [targetUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId));

  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  await db.insert(recoveryToken).values({
    id: token,
    userId,
    type: "link",
    expiresAt,
    createdAt: now,
  });

  const baseUrl = process.env.APP_URL || "http://localhost:5173";
  res.json({ token, url: `${baseUrl}/recover/${token}` });
});

// Validate recovery token — public
router.get("/:token", async (req, res) => {
  const [recovery] = await db
    .select({
      usedAt: recoveryToken.usedAt,
      expiresAt: recoveryToken.expiresAt,
      userName: user.name,
    })
    .from(recoveryToken)
    .innerJoin(user, eq(recoveryToken.userId, user.id))
    .where(eq(recoveryToken.id, req.params.token));

  if (!recovery) {
    res.status(404).json({ valid: false, error: "Hersteltoken niet gevonden" });
    return;
  }

  if (recovery.usedAt) {
    res.status(410).json({ valid: false, error: "Hersteltoken is al gebruikt" });
    return;
  }

  if (recovery.expiresAt < new Date()) {
    res.status(410).json({ valid: false, error: "Hersteltoken is verlopen" });
    return;
  }

  res.json({ valid: true, userName: recovery.userName });
});

// Redeem recovery token — public
router.post("/:token/redeem", async (req, res) => {
  const [recovery] = await db
    .select()
    .from(recoveryToken)
    .where(
      and(
        eq(recoveryToken.id, req.params.token),
        isNull(recoveryToken.usedAt),
      ),
    );

  if (!recovery) {
    res.status(404).json({ error: "Hersteltoken niet gevonden of al gebruikt" });
    return;
  }

  if (recovery.expiresAt < new Date()) {
    res.status(410).json({ error: "Hersteltoken is verlopen" });
    return;
  }

  // Get user's email
  const [targetUser] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, recovery.userId));

  if (!targetUser) {
    res.status(404).json({ error: "Gebruiker niet gevonden" });
    return;
  }

  // Generate new random password and hash it
  const newPassword = crypto.randomBytes(32).toString("hex");
  const hashedPassword = await hashPassword(newPassword);

  // Update account password where providerId="credential"
  await db
    .update(account)
    .set({ password: hashedPassword })
    .where(
      and(
        eq(account.userId, recovery.userId),
        eq(account.providerId, "credential"),
      ),
    );

  // Delete user's passkeys
  await db.delete(passkey).where(eq(passkey.userId, recovery.userId));

  // Mark token as used
  await db
    .update(recoveryToken)
    .set({ usedAt: new Date() })
    .where(eq(recoveryToken.id, req.params.token));

  // Sign in via better-auth to get proper signed cookies
  const signInRequest = new Request("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: targetUser.email, password: newPassword }),
  });

  const authResponse = await auth.handler(signInRequest);

  // Forward the Set-Cookie headers from better-auth
  const setCookies = authResponse.headers.getSetCookie();
  for (const cookie of setCookies) {
    res.append("Set-Cookie", cookie);
  }

  res.json({ success: true });
});

export default router;
