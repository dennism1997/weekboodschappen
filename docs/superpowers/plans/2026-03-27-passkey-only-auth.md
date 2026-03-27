# Passkey-Only Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email/password auth with passkey-only auth, using one-time invite links for onboarding new household members.

**Architecture:** Keep better-auth for sessions, organizations, and passkeys. Add custom endpoints for first-time setup and invite-based signup that create users programmatically via better-auth's server API. Remove all email/password UI and config.

**Tech Stack:** better-auth (server API), @better-auth/passkey, @simplewebauthn/server, Express, React Router, Drizzle ORM

---

### Task 1: Disable email/password and clean up server auth config

**Files:**
- Modify: `packages/server/src/auth.ts`

- [ ] **Step 1: Remove emailAndPassword and ALLOWED_EMAILS from auth config**

Replace the full contents of `packages/server/src/auth.ts` with:

```ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/connection.js";

const SECRET = process.env.BETTER_AUTH_SECRET;
if (!SECRET) {
  throw new Error("BETTER_AUTH_SECRET environment variable must be set");
}

// @ts-ignore - inferred type not portable due to @simplewebauthn/server
export const auth: ReturnType<typeof betterAuth> = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  secret: SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:6883",
  basePath: "/api/auth",
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "http://localhost:5173").split(","),
  emailAndPassword: { enabled: false },
  session: {
    cookieCache: { enabled: true, maxAge: 300 },
  },
  plugins: [
    organization({ allowUserToCreateOrganization: true }),
    passkey({
      rpID: process.env.PASSKEY_RP_ID || "localhost",
      rpName: "Weekboodschappen",
      origin: process.env.PASSKEY_ORIGIN || "http://localhost:5173",
    }),
  ],
});
```

- [ ] **Step 2: Verify server compiles**

Run: `cd packages/server && pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/auth.ts
git commit -m "feat: disable email/password auth"
```

---

### Task 2: Add setup endpoint for first user

**Files:**
- Create: `packages/server/src/routes/setup.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create setup route**

Create `packages/server/src/routes/setup.ts`:

```ts
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
```

- [ ] **Step 2: Mount setup route in app.ts**

In `packages/server/src/app.ts`, add the import after the existing route imports:

```ts
import setupRoutes from "./routes/setup.js";
```

Add the route mount **before** the auth handler (since it needs JSON parsing and should not go through the auth handler):

After `app.use(express.json());` and before the other route mounts, add:

```ts
app.use("/api/setup", setupRoutes);
```

- [ ] **Step 3: Verify server compiles**

Run: `cd packages/server && pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/setup.ts packages/server/src/app.ts
git commit -m "feat: add first-user setup endpoint"
```

---

### Task 3: Add invite endpoints

**Files:**
- Create: `packages/server/src/routes/invite.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create invite route**

Create `packages/server/src/routes/invite.ts`:

```ts
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
```

- [ ] **Step 2: Mount invite route in app.ts**

In `packages/server/src/app.ts`, add the import:

```ts
import inviteRoutes from "./routes/invite.js";
```

Add the route mount after the setup route:

```ts
app.use("/api/invite", inviteRoutes);
```

- [ ] **Step 3: Verify server compiles**

Run: `cd packages/server && pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/invite.ts packages/server/src/app.ts
git commit -m "feat: add invite create/validate/accept endpoints"
```

---

### Task 4: Create Setup page (client)

**Files:**
- Create: `packages/client/src/pages/Setup.tsx`
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Create Setup page**

Create `packages/client/src/pages/Setup.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";

export default function Setup() {
  const [name, setName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showPasskey, setShowPasskey] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => {
        if (!data.needsSetup) navigate("/login", { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [navigate]);

  const handleSetup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, householdName }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup mislukt");
      setShowPasskey(true);
    } catch (err: any) {
      setError(err.message || "Setup mislukt");
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

  if (checking) {
    return <div className="flex h-screen items-center justify-center text-ios-secondary">Laden...</div>;
  }

  if (showPasskey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6">
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
          <button
            onClick={() => navigate("/planner")}
            className="w-full text-center text-[13px] text-ios-secondary"
          >
            Later instellen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Weekboodschappen</h1>
          <p className="mt-2 text-[13px] text-ios-secondary">Welkom! Stel je huishouden in.</p>
        </div>
        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
        <form onSubmit={handleSetup} className="space-y-3">
          <input
            type="text"
            placeholder="Jouw naam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            placeholder="Naam huishouden"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Starten"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Setup route to App.tsx**

In `packages/client/src/App.tsx`, add the import:

```tsx
import Setup from "./pages/Setup.js";
```

Add the route before the login route:

```tsx
<Route path="/setup" element={<Setup />} />
```

- [ ] **Step 3: Verify client compiles**

Run: `cd packages/client && pnpm run typecheck`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Setup.tsx packages/client/src/App.tsx
git commit -m "feat: add first-time setup page"
```

---

### Task 5: Create Invite page (client)

**Files:**
- Create: `packages/client/src/pages/Invite.tsx`
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Create Invite page**

Create `packages/client/src/pages/Invite.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";

export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invite/${token}`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok && data.valid) {
          setValid(true);
          setHouseholdName(data.householdName);
        } else {
          setError(data.error || "Ongeldige uitnodiging");
        }
      })
      .catch(() => setError("Kon uitnodiging niet valideren"))
      .finally(() => setValidating(false));
  }, [token]);

  const handleAccept = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Joinen mislukt");
      setShowPasskey(true);
    } catch (err: any) {
      setError(err.message || "Joinen mislukt");
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
    return <div className="flex h-screen items-center justify-center text-ios-secondary">Uitnodiging controleren...</div>;
  }

  if (!valid && !showPasskey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Uitnodiging ongeldig</h1>
          <p className="text-[15px] text-ios-secondary">{error}</p>
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
          <button
            onClick={() => navigate("/planner")}
            className="w-full text-center text-[13px] text-ios-secondary"
          >
            Later instellen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Weekboodschappen</h1>
          <p className="mt-2 text-[13px] text-ios-secondary">
            Je bent uitgenodigd voor <span className="font-semibold text-ios-label">{householdName}</span>
          </p>
        </div>
        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
        <form onSubmit={handleAccept} className="space-y-3">
          <input
            type="text"
            placeholder="Jouw naam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Joinen"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Invite route to App.tsx**

In `packages/client/src/App.tsx`, add the import:

```tsx
import Invite from "./pages/Invite.js";
```

Add the route alongside the other public routes:

```tsx
<Route path="/invite/:token" element={<Invite />} />
```

- [ ] **Step 3: Verify client compiles**

Run: `cd packages/client && pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Invite.tsx packages/client/src/App.tsx
git commit -m "feat: add invite acceptance page"
```

---

### Task 6: Simplify Login page

**Files:**
- Modify: `packages/client/src/pages/Login.tsx`
- Modify: `packages/client/src/hooks/useAuth.ts`

- [ ] **Step 1: Replace Login.tsx with passkey-only version**

Replace the full contents of `packages/client/src/pages/Login.tsx` with:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";

export default function Login() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) throw new Error(String(result.error.message || "Passkey login mislukt"));
      const orgs = await authClient.organization.list();
      if (orgs.data && orgs.data.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs.data[0].id });
      }
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Passkey login mislukt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Weekboodschappen</h1>
          <p className="mt-1 text-[13px] text-ios-secondary">Inloggen</p>
        </div>

        <button
          onClick={handlePasskeyLogin}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Inloggen met passkey"}
        </button>

        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Clean up useAuth hook**

Replace the full contents of `packages/client/src/hooks/useAuth.ts` with:

```ts
import { authClient } from "../lib/auth-client.js";

export function useAuth() {
  const session = authClient.useSession();
  const activeOrg = authClient.useActiveOrganization();

  return {
    user: session.data?.user || null,
    household: activeOrg.data || null,
    loading: session.isPending,
    authenticated: !!session.data?.session,
    signOut: authClient.signOut,
    createOrganization: authClient.organization.create,
    setActiveOrganization: authClient.organization.setActive,
  };
}
```

- [ ] **Step 3: Verify client compiles**

Run: `cd packages/client && pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Login.tsx packages/client/src/hooks/useAuth.ts
git commit -m "feat: simplify login to passkey-only"
```

---

### Task 7: Update Settings page invite section

**Files:**
- Modify: `packages/client/src/pages/Settings.tsx`

- [ ] **Step 1: Replace the invite section in Settings.tsx**

Find the current invite display (the "Uitnodiging" row that copies the slug) and replace it with an invite link generator.

Replace this block in the `{/* Household info */}` section:

```tsx
        <div className="ml-4 flex min-h-[44px] items-center justify-between border-t border-ios-separator py-3 pr-4">
          <span className="text-[17px] text-ios-label">Uitnodiging</span>
          <button
            onClick={copyInviteLink}
            className="flex items-center gap-1 rounded-[8px] bg-ios-category-bg px-3 py-1 font-mono text-[13px] text-ios-label"
          >
            {household?.slug || "\u2014"}
            <span className="text-[11px] text-ios-secondary">
              {copied ? "Gekopieerd!" : "Kopieer"}
            </span>
          </button>
        </div>
```

With:

```tsx
        <div className="ml-4 flex min-h-[44px] items-center justify-between border-t border-ios-separator py-3 pr-4">
          <span className="text-[17px] text-ios-label">Uitnodiging</span>
          {inviteUrl ? (
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-1 rounded-[8px] bg-ios-category-bg px-3 py-1 font-mono text-[13px] text-ios-label"
            >
              <span className="max-w-[140px] truncate">{inviteUrl}</span>
              <span className="text-[11px] text-ios-secondary">
                {copied ? "Gekopieerd!" : "Kopieer"}
              </span>
            </button>
          ) : (
            <button
              onClick={createInviteLink}
              disabled={creatingInvite}
              className="rounded-[8px] bg-accent px-3 py-1 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {creatingInvite ? "Bezig..." : "Link maken"}
            </button>
          )}
        </div>
```

- [ ] **Step 2: Add the invite state and handlers**

At the top of the `Settings` component function, add:

```tsx
  const [inviteUrl, setInviteUrl] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
```

Replace the existing `copyInviteLink` function with:

```tsx
  const createInviteLink = async () => {
    setCreatingInvite(true);
    try {
      const res = await apiFetch<{ url: string }>("/invite/create", { method: "POST" });
      setInviteUrl(res.url);
      await navigator.clipboard.writeText(res.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };
```

- [ ] **Step 3: Verify client compiles**

Run: `cd packages/client && pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Settings.tsx
git commit -m "feat: add invite link creation to settings"
```

---

### Task 8: Remove ALLOWED_EMAILS from environment config

**Files:**
- Modify: `packages/server/src/auth.ts` (already done in Task 1)
- Modify: `docker-compose.yml` (if ALLOWED_EMAILS is referenced)
- Modify: `docker-compose.dev.yml` (if ALLOWED_EMAILS is referenced)

- [ ] **Step 1: Check and remove ALLOWED_EMAILS from env/compose files**

Search for any `ALLOWED_EMAILS` references in docker-compose files and `.env.example` if it exists. Remove them.

Run: `grep -r "ALLOWED_EMAILS" . --include="*.yml" --include="*.yaml" --include="*.env*" --include="*.example"`

Remove any matches found.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove ALLOWED_EMAILS references"
```

---

### Task 9: End-to-end verification

- [ ] **Step 1: Build and verify both packages compile**

Run:
```bash
cd packages/server && pnpm run typecheck
cd ../client && pnpm run typecheck
```

Expected: No errors in either package.

- [ ] **Step 2: Test full flow locally**

Start dev servers:
```bash
pnpm dev
```

Test:
1. Open `http://localhost:5173` — should redirect to `/login`
2. Navigate to `/setup` — should show setup form (if fresh DB)
3. Enter name + household name → should create account and prompt passkey
4. After passkey setup, should land on `/planner`
5. Go to Settings → click "Link maken" → should generate and copy invite URL
6. Open invite URL in incognito → should show household name and name input
7. Enter name → should create account and prompt passkey
8. Login screen should only show passkey button, no email/password

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: passkey-only auth with invite links"
```
