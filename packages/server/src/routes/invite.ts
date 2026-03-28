import {Router} from "express";
import crypto from "node:crypto";
import {db} from "../db/connection.js";
import {invitation, member, organization, session, user} from "../db/auth-schema.js";
import {and, desc, eq} from "drizzle-orm";
import {requireAuth} from "../middleware/auth.js";
import {auth} from "../auth.js";

const router = Router();

// List household members with last session info — authenticated
router.get("/members", requireAuth, async (req, res) => {
  if (!req.user?.householdId) {
    res.status(400).json({ error: "No active household" });
    return;
  }

  const members = db
    .select({
      id: user.id,
      name: user.name,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, req.user.householdId))
    .all();

  const enriched = members.map((m) => {
    const lastSession = db
      .select({ createdAt: session.createdAt })
      .from(session)
      .where(eq(session.userId, m.id))
      .orderBy(desc(session.createdAt))
      .limit(1)
      .get();

    return {
      ...m,
      lastLogin: lastSession?.createdAt ?? null,
    };
  });

  res.json(enriched);
});

// Remove member from household — authenticated, owner only
router.delete("/members/:userId", requireAuth, async (req, res) => {
  if (!req.user?.householdId) {
    res.status(400).json({ error: "No active household" });
    return;
  }

  // Check that the current user is the owner
  const currentMembership = db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, req.user.userId), eq(member.organizationId, req.user.householdId)))
    .get();

  if (currentMembership?.role !== "owner") {
    res.status(403).json({ error: "Alleen de eigenaar kan leden verwijderen" });
    return;
  }

  const targetUserId = req.params.userId as string;

  // Can't remove yourself
  if (targetUserId === req.user.userId) {
    res.status(400).json({ error: "Je kunt jezelf niet verwijderen" });
    return;
  }

  db.delete(member)
    .where(and(eq(member.userId, targetUserId), eq(member.organizationId, req.user.householdId)))
    .run();

  res.json({ success: true });
});

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

  const email = `${crypto.randomUUID()}@passkey.local`;
  const password = crypto.randomBytes(32).toString("hex");

  // Create user via better-auth API so session/cookies are handled properly
  const signUpResponse = await auth.api.signUpEmail({
    body: { email, password, name },
  });

  if (!signUpResponse?.user) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }

  // Add user to organization
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: invite.organizationId,
    userId: signUpResponse.user.id,
    role: "member",
    createdAt: new Date(),
  });

  // Mark invite as used
  await db.update(invitation)
    .set({ status: "accepted" })
    .where(eq(invitation.id, req.params.token));

  // Sign in via better-auth to get proper signed cookies
  const signInRequest = new Request("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const authResponse = await auth.handler(signInRequest);

  // Forward the Set-Cookie headers from better-auth
  const setCookies = authResponse.headers.getSetCookie();
  for (const cookie of setCookies) {
    res.append("Set-Cookie", cookie);
  }

  res.json({ success: true, userId: signUpResponse.user.id });
});

export default router;
