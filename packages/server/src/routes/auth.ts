import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "../db/connection.js";
import { household, user } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createToken, requireAuth } from "../middleware/auth.js";
import { seedStoreConfig } from "../db/seed.js";

const router = Router();

router.post("/register", async (req, res) => {
  const { householdName, userName, password } = req.body;

  if (!householdName || !userName || !password) {
    res.status(400).json({ error: "householdName, userName, and password are required" });
    return;
  }

  const householdId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const inviteCode = crypto.randomUUID().slice(0, 8);
  const passwordHash = await bcrypt.hash(password, 10);

  db.insert(household)
    .values({
      id: householdId,
      name: householdName,
      inviteCode,
    })
    .run();

  db.insert(user)
    .values({
      id: userId,
      householdId,
      name: userName,
      passwordHash,
    })
    .run();

  seedStoreConfig(householdId);

  const token = createToken({ userId, householdId });
  res.json({ token, householdId, userId, inviteCode });
});

router.post("/login", async (req, res) => {
  const { userName, password } = req.body;

  if (!userName || !password) {
    res.status(400).json({ error: "userName and password are required" });
    return;
  }

  const found = db
    .select()
    .from(user)
    .where(eq(user.name, userName))
    .get();

  if (!found) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, found.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = createToken({
    userId: found.id,
    householdId: found.householdId,
  });
  res.json({ token, householdId: found.householdId, userId: found.id });
});

router.post("/join", async (req, res) => {
  const { inviteCode, userName, password } = req.body;

  if (!inviteCode || !userName || !password) {
    res.status(400).json({ error: "inviteCode, userName, and password are required" });
    return;
  }

  const found = db
    .select()
    .from(household)
    .where(eq(household.inviteCode, inviteCode))
    .get();

  if (!found) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }

  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  db.insert(user)
    .values({
      id: userId,
      householdId: found.id,
      name: userName,
      passwordHash,
    })
    .run();

  const token = createToken({ userId, householdId: found.id });
  res.json({ token, householdId: found.id, userId });
});

router.get("/me", requireAuth, (req, res) => {
  const found = db
    .select({
      id: user.id,
      name: user.name,
      householdId: user.householdId,
    })
    .from(user)
    .where(eq(user.id, req.user!.userId))
    .get();

  if (!found) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const h = db
    .select({
      id: household.id,
      name: household.name,
      inviteCode: household.inviteCode,
      preferredStore: household.preferredStore,
    })
    .from(household)
    .where(eq(household.id, found.householdId))
    .get();

  res.json({ user: found, household: h });
});

export default router;
