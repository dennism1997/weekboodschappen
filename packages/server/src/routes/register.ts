import {Router} from "express";
import crypto from "node:crypto";
import {db} from "../db/connection.js";
import {member, organization, user} from "../db/auth-schema.js";
import {count} from "drizzle-orm";
import {auth} from "../auth.js";
import {sendPushoverNotification} from "../services/pushover.js";

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
