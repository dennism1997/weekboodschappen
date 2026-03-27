# Passkey Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to recover access when they lose their passkey, with separate flows for regular members (owner generates recovery link) and the owner/host (recovery code shown at setup, plus admin API fallback).

**Architecture:** Recovery tokens are stored in a new `recovery_token` table. When redeemed, the server resets the user's internal password (the random one created at signup), deletes their old passkeys, signs them in via `auth.handler`, and the client prompts passkey re-registration. Owner gets a recovery code at setup time. An admin endpoint protected by `BETTER_AUTH_SECRET` is the last-resort fallback.

**Tech Stack:** Express, Drizzle ORM (SQLite), better-auth (scrypt password hashing), React, TanStack Query

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/server/src/routes/recovery.ts` | Recovery token CRUD + redemption (sign-in via password reset) |
| Create | `packages/client/src/pages/Recover.tsx` | Recovery page — validates token, redeems, prompts passkey re-registration |
| Modify | `packages/server/src/db/auth-schema.ts` | Add `recoveryToken` table + relations |
| Modify | `packages/server/src/app.ts` | Mount `/api/recovery` routes |
| Modify | `packages/server/src/routes/setup.ts` | Generate + return owner recovery code |
| Modify | `packages/client/src/pages/Setup.tsx` | Show recovery code after setup, before passkey step |
| Modify | `packages/client/src/pages/Settings.tsx` | "Reset passkey" button per member (owner only) |
| Modify | `packages/client/src/App.tsx` | Add `/recover/:token` route |

---

### Task 1: Add `recoveryToken` schema + migration

**Files:**
- Modify: `packages/server/src/db/auth-schema.ts`

- [ ] **Step 1: Add the recoveryToken table to the auth schema**

Add after the `passkeyRelations` definition at the end of `packages/server/src/db/auth-schema.ts`:

```typescript
export const recoveryToken = sqliteTable(
  "recovery_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "link" or "code"
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("recovery_token_userId_idx").on(table.userId),
  ],
);

export const recoveryTokenRelations = relations(recoveryToken, ({ one }) => ({
  user: one(user, {
    fields: [recoveryToken.userId],
    references: [user.id],
  }),
}));
```

- [ ] **Step 2: Check schema.ts re-export**

Read `packages/server/src/db/schema.ts`. If it does `export * from "./auth-schema.js"`, no change needed. Otherwise add `recoveryToken` and `recoveryTokenRelations` to the exports.

- [ ] **Step 3: Generate migration**

Run: `pnpm run --filter @weekboodschappen/server db:generate`

Expected: A new migration file in `packages/server/migrations/` with `CREATE TABLE recovery_token`.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/db/auth-schema.ts packages/server/migrations/
git commit -m "feat: add recovery_token schema and migration"
```

---

### Task 2: Create recovery server routes

**Files:**
- Create: `packages/server/src/routes/recovery.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create the recovery routes**

Create `packages/server/src/routes/recovery.ts`:

```typescript
import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/connection.js";
import {
  recoveryToken,
  passkey,
  user,
  member,
  account,
} from "../db/auth-schema.js";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { auth } from "../auth.js";
import { hashPassword } from "better-auth/crypto";

const router = Router();

// Owner creates a recovery link for a household member
router.post("/create", requireAuth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  // Verify requester is an owner
  const [ownerMembership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, req.user!.userId),
        eq(member.organizationId, req.user!.householdId),
        eq(member.role, "owner"),
      ),
    );

  if (!ownerMembership) {
    res.status(403).json({ error: "Only the owner can create recovery links" });
    return;
  }

  // Verify target user is in the same household
  const [targetMembership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, req.user!.householdId),
      ),
    );

  if (!targetMembership) {
    res.status(404).json({ error: "User not found in household" });
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
  res.json({ url: `${baseUrl}/recover/${token}` });
});

// Admin endpoint: create recovery for any user using BETTER_AUTH_SECRET
// Last resort when the owner loses their passkey and recovery code
router.post("/admin", async (req, res) => {
  const { secret, userId } = req.body;

  if (!secret || secret !== process.env.BETTER_AUTH_SECRET) {
    res.status(403).json({ error: "Invalid admin secret" });
    return;
  }

  if (!userId) {
    const users = await db
      .select({ id: user.id, name: user.name })
      .from(user);
    res.json({ users });
    return;
  }

  const [target] = await db.select().from(user).where(eq(user.id, userId));
  if (!target) {
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

  const baseUrl = process.env.APP_URL || "http://localhost:6883";
  res.json({ url: `${baseUrl}/recover/${token}` });
});

// Validate recovery token — public
router.get("/:token", async (req, res) => {
  const [record] = await db
    .select({
      id: recoveryToken.id,
      expiresAt: recoveryToken.expiresAt,
      usedAt: recoveryToken.usedAt,
      userName: user.name,
    })
    .from(recoveryToken)
    .innerJoin(user, eq(recoveryToken.userId, user.id))
    .where(eq(recoveryToken.id, req.params.token));

  if (!record) {
    res.status(404).json({ valid: false, error: "Hersteltoken niet gevonden" });
    return;
  }

  if (record.usedAt) {
    res.status(410).json({ valid: false, error: "Hersteltoken is al gebruikt" });
    return;
  }

  if (record.expiresAt < new Date()) {
    res.status(410).json({ valid: false, error: "Hersteltoken is verlopen" });
    return;
  }

  res.json({ valid: true, userName: record.userName });
});

// Redeem recovery token — public
// Resets the user's password, deletes passkeys, signs them in
router.post("/:token/redeem", async (req, res) => {
  const [record] = await db
    .select()
    .from(recoveryToken)
    .where(
      and(
        eq(recoveryToken.id, req.params.token),
        isNull(recoveryToken.usedAt),
      ),
    );

  if (!record) {
    res.status(404).json({ error: "Hersteltoken niet gevonden of al gebruikt" });
    return;
  }

  if (record.expiresAt < new Date()) {
    res.status(410).json({ error: "Hersteltoken is verlopen" });
    return;
  }

  // Get user's internal email
  const [userData] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, record.userId));

  if (!userData) {
    res.status(500).json({ error: "Gebruiker niet gevonden" });
    return;
  }

  // Reset password to a new random one
  const newPassword = crypto.randomBytes(32).toString("hex");
  const hashedPassword = await hashPassword(newPassword);

  await db
    .update(account)
    .set({ password: hashedPassword })
    .where(
      and(
        eq(account.userId, record.userId),
        eq(account.providerId, "credential"),
      ),
    );

  // Delete existing passkeys so user can register fresh
  await db.delete(passkey).where(eq(passkey.userId, record.userId));

  // Mark token as used
  await db
    .update(recoveryToken)
    .set({ usedAt: new Date() })
    .where(eq(recoveryToken.id, req.params.token));

  // Sign in via better-auth (same pattern as setup/invite)
  const signInRequest = new Request("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: userData.email, password: newPassword }),
  });

  const authResponse = await auth.handler(signInRequest);

  const setCookies = authResponse.headers.getSetCookie();
  for (const cookie of setCookies) {
    res.append("Set-Cookie", cookie);
  }

  res.json({ success: true });
});

export default router;
```

- [ ] **Step 2: Mount recovery routes in app.ts**

In `packages/server/src/app.ts`, add after the `inviteRoutes` import:

```typescript
import recoveryRoutes from "./routes/recovery.js";
```

And after `app.use("/api/invite", inviteRoutes);`:

```typescript
app.use("/api/recovery", recoveryRoutes);
```

- [ ] **Step 3: Verify the import from better-auth/crypto works**

Run: `pnpm run --filter @weekboodschappen/server typecheck`

If `hashPassword` isn't exported from `"better-auth/crypto"`, try `"better-auth/dist/crypto/password.mjs"` or implement it inline using the scrypt pattern from better-auth's source (see `password.mjs` in node_modules).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/recovery.ts packages/server/src/app.ts
git commit -m "feat: add recovery endpoints (owner link, admin, validate, redeem)"
```

---

### Task 3: Generate owner recovery code at setup

**Files:**
- Modify: `packages/server/src/routes/setup.ts`

- [ ] **Step 1: Generate a recovery code during setup and store it**

In `packages/server/src/routes/setup.ts`, add imports at the top:

```typescript
import { recoveryToken } from "../db/auth-schema.js";
```

In the `POST /` handler, after the member is created and before signing in (after line `await db.insert(member).values({...})`), add:

```typescript
  // Generate owner recovery code (shown once, stored as a "code" type token)
  const recoveryCode = [
    crypto.randomBytes(3).toString("hex"),
    crypto.randomBytes(3).toString("hex"),
    crypto.randomBytes(3).toString("hex"),
  ].join("-"); // e.g. "a1b2c3-d4e5f6-a7b8c9"

  const codeExpiresAt = new Date("2099-12-31"); // recovery codes don't expire

  await db.insert(recoveryToken).values({
    id: recoveryCode,
    userId: signUpResponse.user.id,
    type: "code",
    expiresAt: codeExpiresAt,
    createdAt: now,
  });
```

Then update the response at the end to include the recovery code. Change:

```typescript
  res.json({ success: true, userId: signUpResponse.user.id });
```

To:

```typescript
  res.json({ success: true, userId: signUpResponse.user.id, recoveryCode });
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/routes/setup.ts
git commit -m "feat: generate owner recovery code during setup"
```

---

### Task 4: Show recovery code in Setup page

**Files:**
- Modify: `packages/client/src/pages/Setup.tsx`

- [ ] **Step 1: Capture recovery code from setup response and show it before passkey step**

In `packages/client/src/pages/Setup.tsx`, add a state variable for the recovery code:

```typescript
const [recoveryCode, setRecoveryCode] = useState("");
```

In the `handleSetup` function, after parsing the response, capture the code. Change the existing `setShowPasskey(true)` block to also capture the code:

```typescript
      setRecoveryCode(data.recoveryCode || "");
      setShowPasskey(true);
```

Then replace the `showPasskey` render block (the one with the "Passkey instellen" heading) with a two-part flow that shows the recovery code first:

```tsx
  if (showPasskey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6">
          {recoveryCode && !recoveryCodeSaved ? (
            <>
              <div className="text-center">
                <h1 className="text-[34px] font-bold text-ios-label">Herstelcode</h1>
                <p className="mt-2 text-[13px] text-ios-secondary">
                  Bewaar deze code op een veilige plek. Als je je passkey verliest, kun je hiermee je account herstellen.
                </p>
              </div>
              <div className="rounded-[12px] bg-white p-4 text-center">
                <code className="text-[20px] font-mono font-bold tracking-wider text-ios-label">
                  {recoveryCode}
                </code>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(recoveryCode).catch(() => {});
                  setRecoveryCodeSaved(true);
                }}
                className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white"
              >
                Gekopieerd — Ga verder
              </button>
            </>
          ) : (
            <>
              <div className="text-center">
                <h1 className="text-[34px] font-bold text-ios-label">Passkey instellen</h1>
                <p className="mt-2 text-[13px] text-ios-secondary">
                  Stel een passkey in zodat je voortaan snel en veilig kunt inloggen.
                </p>
              </div>
              {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
              <button
                onClick={handleRegisterPasskey}
                disabled={loading}
                className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Bezig..." : "Passkey registreren"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
```

Also add the `recoveryCodeSaved` state at the top:

```typescript
const [recoveryCodeSaved, setRecoveryCodeSaved] = useState(false);
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/pages/Setup.tsx
git commit -m "feat: show recovery code during setup before passkey registration"
```

---

### Task 5: Add `/recover/:token` route and Recover page (client)

**Files:**
- Create: `packages/client/src/pages/Recover.tsx`
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Create the Recover page**

Create `packages/client/src/pages/Recover.tsx`:

```tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client.js";

export default function Recover() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);
  const navigate = useNavigate();

  const { data: recovery, isLoading: validating } = useQuery({
    queryKey: ["recovery", token],
    queryFn: async () => {
      const r = await fetch(`/api/recovery/${token}`);
      const data = await r.json();
      if (r.ok && data.valid) {
        return { valid: true as const, userName: data.userName as string };
      }
      return { valid: false as const, error: (data.error || "Ongeldige herstellink") as string };
    },
    enabled: !!token,
  });

  const handleRedeem = async () => {
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`/api/recovery/${token}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Herstel mislukt");
      // Set active organization
      const orgs = await authClient.organization.list();
      if (orgs.data && orgs.data.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs.data[0].id });
      }
      setShowPasskey(true);
    } catch (err: any) {
      setError(err.message || "Herstel mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.passkey.addPasskey({ name: "Weekboodschappen" });
      if (result?.error) throw new Error(String(result.error.message || "Passkey registreren mislukt"));
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Passkey registreren mislukt");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return <div className="flex h-screen items-center justify-center text-ios-secondary">Hersteltoken controleren...</div>;
  }

  if (!recovery?.valid && !showPasskey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Herstel ongeldig</h1>
          <p className="text-[15px] text-ios-secondary">{recovery?.valid === false ? recovery.error : error}</p>
          <button
            onClick={() => navigate("/login")}
            className="text-[15px] text-accent underline"
          >
            Naar inloggen
          </button>
        </div>
      </div>
    );
  }

  if (showPasskey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-[34px] font-bold text-ios-label">Nieuwe passkey instellen</h1>
            <p className="mt-2 text-[13px] text-ios-secondary">
              Je account is hersteld. Stel een nieuwe passkey in om in te loggen.
            </p>
          </div>
          {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
          <button
            onClick={handleRegisterPasskey}
            disabled={loading}
            className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Passkey registreren"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Account herstellen</h1>
          <p className="mt-2 text-[13px] text-ios-secondary">
            Welkom terug, <span className="font-semibold text-ios-label">{recovery?.valid ? recovery.userName : ""}</span>.
            Je bestaande passkey wordt verwijderd en je kunt een nieuwe instellen.
          </p>
        </div>
        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
        <button
          onClick={handleRedeem}
          disabled={loading}
          className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Account herstellen"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route to App.tsx**

In `packages/client/src/App.tsx`, add the import:

```typescript
import Recover from "./pages/Recover.js";
```

Add the route alongside the other public routes (after `<Route path="/invite/:token" ...>`):

```tsx
<Route path="/recover/:token" element={<Recover />} />
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Recover.tsx packages/client/src/App.tsx
git commit -m "feat: add recovery page with token validation and passkey re-registration"
```

---

### Task 6: Add recovery code redemption to Login page

**Files:**
- Modify: `packages/client/src/pages/Login.tsx`

- [ ] **Step 1: Add a "Use recovery code" option to the login page**

In `packages/client/src/pages/Login.tsx`, add state for the recovery code flow:

```typescript
const [showRecovery, setShowRecovery] = useState(false);
const [recoveryCode, setRecoveryCode] = useState("");
const [recoveryLoading, setRecoveryLoading] = useState(false);
```

Add a handler for recovery code submission:

```typescript
  const handleRecoveryCode = async () => {
    const code = recoveryCode.trim();
    if (!code) return;
    setError("");
    setRecoveryLoading(true);
    try {
      // Validate the code as a recovery token
      const r = await fetch(`/api/recovery/${encodeURIComponent(code)}`);
      const data = await r.json();
      if (!r.ok || !data.valid) {
        throw new Error(data.error || "Ongeldige herstelcode");
      }
      // Redirect to recovery page
      navigate(`/recover/${encodeURIComponent(code)}`);
    } catch (err: any) {
      setError(err.message || "Ongeldige herstelcode");
    } finally {
      setRecoveryLoading(false);
    }
  };
```

In the return JSX, add after the passkey button and error display (before the closing `</div>` of the form area):

```tsx
        <div className="text-center">
          {showRecovery ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Herstelcode (bijv. a1b2c3-d4e5f6-a7b8c9)"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-center font-mono text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleRecoveryCode}
                disabled={recoveryLoading || !recoveryCode.trim()}
                className="w-full rounded-[14px] border border-accent px-4 py-3 text-[15px] font-semibold text-accent disabled:opacity-50"
              >
                {recoveryLoading ? "Controleren..." : "Herstellen"}
              </button>
              <button
                onClick={() => setShowRecovery(false)}
                className="text-[13px] text-ios-secondary"
              >
                Annuleren
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowRecovery(true)}
              className="text-[13px] text-ios-secondary"
            >
              Passkey verloren? Gebruik herstelcode
            </button>
          )}
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/pages/Login.tsx
git commit -m "feat: add recovery code input to login page"
```

---

### Task 7: Add "Reset passkey" for members in Settings

**Files:**
- Modify: `packages/client/src/pages/Settings.tsx`

- [ ] **Step 1: Add reset passkey functionality to the members list**

In `packages/client/src/pages/Settings.tsx`, add state for the recovery URL:

```typescript
const [recoveryUrl, setRecoveryUrl] = useState("");
const [resettingUserId, setResettingUserId] = useState("");
```

Add the reset handler:

```typescript
  const resetMemberPasskey = async (memberId: string) => {
    setResettingUserId(memberId);
    try {
      const res = await apiFetch<{ url: string }>("/recovery/create", {
        method: "POST",
        body: JSON.stringify({ userId: memberId }),
      });
      setRecoveryUrl(res.url);
      await navigator.clipboard.writeText(res.url);
    } catch {
      // ignore
    } finally {
      setResettingUserId("");
    }
  };
```

In the members list rendering, after the member name and "(jij)" indicator, add a reset button for non-self members. Replace the member `<div>` content:

```tsx
          members.map((m, idx) => (
            <div
              key={m.id}
              className={`flex min-h-[44px] items-center gap-3 px-4 py-3 ${
                idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-[13px] font-semibold text-accent">
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-[17px] text-ios-label">
                {m.name}
                {m.id === user?.id && (
                  <span className="ml-1 text-[13px] text-ios-tertiary">(jij)</span>
                )}
              </span>
              {m.id !== user?.id && (
                <button
                  onClick={() => resetMemberPasskey(m.id)}
                  disabled={resettingUserId === m.id}
                  className="rounded-[8px] bg-ios-category-bg px-3 py-1 text-[13px] text-ios-secondary disabled:opacity-50"
                >
                  {resettingUserId === m.id ? "Bezig..." : "Reset passkey"}
                </button>
              )}
            </div>
          ))
```

Add a banner showing the recovery URL when one is generated, right after the members `</section>`:

```tsx
      {recoveryUrl && (
        <div className="mb-6 rounded-[12px] bg-accent-light p-4">
          <p className="text-[13px] font-semibold text-ios-label">Herstellink gekopieerd!</p>
          <p className="mt-1 break-all font-mono text-[12px] text-ios-secondary">{recoveryUrl}</p>
          <p className="mt-2 text-[12px] text-ios-tertiary">Stuur deze link naar het lid. De link is 1 uur geldig.</p>
          <button
            onClick={() => setRecoveryUrl("")}
            className="mt-2 text-[13px] text-accent"
          >
            Sluiten
          </button>
        </div>
      )}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/pages/Settings.tsx
git commit -m "feat: add reset passkey button for household members in settings"
```

---

### Task 8: Verify everything typechecks and works end-to-end

**Files:** None new — verification only.

- [ ] **Step 1: Typecheck server**

Run: `pnpm run --filter @weekboodschappen/server typecheck`
Expected: No errors.

- [ ] **Step 2: Typecheck client**

Run: `pnpm run --filter @weekboodschappen/client typecheck`
Expected: No errors.

- [ ] **Step 3: Test the full flows mentally**

Verify these flows are covered:

1. **Owner setup** → recovery code shown → save it → register passkey
2. **Owner loses passkey** → enter recovery code on login page → redirected to `/recover/:code` → account recovered → register new passkey
3. **Member loses passkey** → owner goes to Settings → clicks "Reset passkey" → copies link → member visits link → clicks "Account herstellen" → register new passkey
4. **Owner loses passkey AND recovery code** → SSH into server → `curl -X POST http://localhost:6883/api/recovery/admin -H "Content-Type: application/json" -d '{"secret":"YOUR_BETTER_AUTH_SECRET"}'` to list users → `curl -X POST http://localhost:6883/api/recovery/admin -H "Content-Type: application/json" -d '{"secret":"YOUR_BETTER_AUTH_SECRET","userId":"THE_USER_ID"}'` to get recovery URL → visit URL in browser

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: passkey recovery — owner code, member reset, admin fallback"
```
