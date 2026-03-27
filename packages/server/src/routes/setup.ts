import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/connection.js";
import { user, organization, member, recoveryToken } from "../db/auth-schema.js";
import { count } from "drizzle-orm";
import { auth } from "../auth.js";
import { refreshCachedSuggestions } from "../services/recommendations.js";

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

  // Create organization and membership
  const orgId = crypto.randomUUID();
  const now = new Date();

  await db.insert(organization).values({
    id: orgId,
    name: householdName,
    slug: crypto.randomUUID().slice(0, 8),
    createdAt: now,
  });

  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId: signUpResponse.user.id,
    role: "owner",
    createdAt: now,
  });

  // Generate owner recovery code (shown once, stored as a "code" type token)
  const recoveryCode = [
    crypto.randomBytes(3).toString("hex"),
    crypto.randomBytes(3).toString("hex"),
    crypto.randomBytes(3).toString("hex"),
  ].join("-");

  await db.insert(recoveryToken).values({
    id: recoveryCode,
    userId: signUpResponse.user.id,
    type: "code",
    expiresAt: new Date("2099-12-31"),
    createdAt: now,
  });

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

  // Generate initial suggestions for the new household (async, don't block response)
  refreshCachedSuggestions(orgId).catch((err) => {
    console.error("Failed to generate initial suggestions:", err);
  });

  res.json({ success: true, userId: signUpResponse.user.id, recoveryCode });
});

export default router;
