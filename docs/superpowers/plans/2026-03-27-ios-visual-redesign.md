# iOS Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all client components to match an iOS native design with `#B4A0ED` lavender accent, outline icons, grouped lists, and system typography.

**Architecture:** Pure visual refactor — CSS custom properties in `index.css` define the design tokens, each component's Tailwind classes are updated to reference them. `lucide-react` provides outline icons for the tab bar. No structural, behavioral, or server-side changes.

**Tech Stack:** React 19, Tailwind CSS v4, lucide-react (new), Vite

**Spec:** `docs/superpowers/specs/2026-03-27-ios-visual-redesign-design.md`

---

### Task 1: Install lucide-react and define CSS custom properties

**Files:**
- Modify: `packages/client/package.json`
- Modify: `packages/client/src/index.css`

- [ ] **Step 1: Install lucide-react**

Run from project root:
```bash
pnpm --filter @weekboodschappen/client add lucide-react
```

- [ ] **Step 2: Define design tokens in index.css**

Replace the contents of `packages/client/src/index.css` with:

```css
@import "tailwindcss";

@theme {
  --color-accent: #B4A0ED;
  --color-accent-light: #F3EFFC;
  --color-ios-bg: #F2F2F7;
  --color-ios-surface: #FFFFFF;
  --color-ios-separator: #C6C6C8;
  --color-ios-label: #1D1D1F;
  --color-ios-secondary: #86868B;
  --color-ios-tertiary: #C7C7CC;
  --color-ios-destructive: #FF3B30;
  --color-ios-segmented-bg: #E9E9EB;
  --color-ios-category-bg: #EFEFF4;
  --color-source-recept-bg: #E8F0FE;
  --color-source-recept-text: #4A7FE5;
  --color-source-basis-bg: #FFF3E0;
  --color-source-basis-text: #E09B3D;
  --color-source-handmatig-bg: #F3E8FF;
  --color-source-handmatig-text: #9B59B6;
}
```

This uses Tailwind v4's `@theme` directive so tokens are available as e.g. `bg-accent`, `text-ios-label`, `border-ios-separator`.

- [ ] **Step 3: Verify dev server starts**

```bash
pnpm --filter @weekboodschappen/client dev
```

Open http://localhost:5173 — app should load without errors. No visual changes yet.

- [ ] **Step 4: Commit**

```bash
git add packages/client/package.json packages/client/src/index.css pnpm-lock.yaml
git commit -m "feat: add lucide-react and iOS design tokens"
```

---

### Task 2: Update Layout and BottomNav

**Files:**
- Modify: `packages/client/src/components/Layout.tsx`
- Modify: `packages/client/src/components/BottomNav.tsx`

- [ ] **Step 1: Update Layout.tsx**

Replace the full component body in `packages/client/src/components/Layout.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav.js";

export default function Layout() {
  return (
    <div className="min-h-screen bg-ios-bg pb-24">
      <main className="mx-auto max-w-lg px-4 pt-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
```

Changes: `bg-gray-50` → `bg-ios-bg`, `pb-20` → `pb-24` (more space for safe area tab bar).

- [ ] **Step 2: Update BottomNav.tsx**

Replace the full file `packages/client/src/components/BottomNav.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { Calendar, ClipboardCheck, BookOpen, ShoppingCart, Settings } from "lucide-react";

const navItems = [
  { to: "/planner", label: "Plan", icon: Calendar },
  { to: "/list", label: "Lijst", icon: ClipboardCheck },
  { to: "/recipes", label: "Recepten", icon: BookOpen },
  { to: "/staples", label: "Basis", icon: ShoppingCart },
  { to: "/settings", label: "Instellingen", icon: Settings },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-ios-separator bg-[rgba(249,249,249,0.94)] backdrop-blur-[20px]"
         style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
      <div className="mx-auto flex max-w-lg justify-around">
        {navItems.map((item) => (
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

Changes: emoji → lucide icons, frosted glass background, accent color for active state, safe area inset.

- [ ] **Step 3: Verify in browser**

Tab bar should show outline icons, frosted glass background, lavender active state. Pages should have the light gray background.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/Layout.tsx packages/client/src/components/BottomNav.tsx
git commit -m "feat: iOS tab bar with outline icons and frosted glass"
```

---

### Task 3: Update App.tsx loading state and Login.tsx

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/pages/Login.tsx`

- [ ] **Step 1: Update loading state in App.tsx**

In `packages/client/src/App.tsx`, change the loading div:

From: `className="flex h-screen items-center justify-center text-gray-400"`
To: `className="flex h-screen items-center justify-center text-ios-secondary"`

- [ ] **Step 2: Update Login.tsx**

Replace the full file `packages/client/src/pages/Login.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { authClient } from "../lib/auth-client.js";

type Mode = "login" | "register" | "join" | "setup-passkey";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [invitationId, setInvitationId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, createOrganization, setActiveOrganization } = useAuth();
  const navigate = useNavigate();

  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) throw new Error(String(result.error.message || "Passkey login mislukt"));
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Passkey login mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.passkey.addPasskey({
        name: "Weekboodschappen",
      });
      if (result?.error) throw new Error(String(result.error.message || "Passkey registreren mislukt"));
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Passkey registreren mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const result = await signUp({ email, password, name });
        if (result.error) throw new Error(result.error.message || "Registreren mislukt");
        const org = await createOrganization({
          name: householdName,
          slug: crypto.randomUUID().slice(0, 8),
        });
        if (org.error) throw new Error(org.error.message || "Huishouden aanmaken mislukt");
        if (org.data) {
          await setActiveOrganization({ organizationId: org.data.id });
        }
        setMode("setup-passkey");
        setLoading(false);
        return;
      } else if (mode === "join") {
        const result = await signUp({ email, password, name });
        if (result.error) throw new Error(result.error.message || "Registreren mislukt");
        const accept = await authClient.organization.acceptInvitation({ invitationId });
        if (accept.error) throw new Error(accept.error.message || "Uitnodiging accepteren mislukt");
        setMode("setup-passkey");
        setLoading(false);
        return;
      }
    } catch (err: any) {
      setError(err.message || "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "setup-passkey") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-[34px] font-bold text-ios-label">Passkey instellen</h1>
            <p className="mt-2 text-[13px] text-ios-secondary">
              Stel een passkey in zodat je voortaan snel en veilig kunt inloggen met Face ID, vingerafdruk of je apparaat.
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
          <p className="mt-1 text-[13px] text-ios-secondary">
            {mode === "login" && "Inloggen"}
            {mode === "register" && "Nieuw account aanmaken"}
            {mode === "join" && "Huishouden joinen"}
          </p>
        </div>

        {mode === "login" && (
          <div className="space-y-3">
            <button
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Bezig..." : "Inloggen met passkey"}
            </button>

            {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-ios-separator" />
              </div>
              <div className="relative flex justify-center text-[13px]">
                <span className="bg-ios-bg px-2 text-ios-secondary">of</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={mode === "login"
          ? async (e) => {
              e.preventDefault();
              setError("");
              setLoading(true);
              try {
                const result = await signIn({ email, password });
                if (result?.error) throw new Error(result.error.message || "Inloggen mislukt");
                navigate("/planner");
              } catch (err: any) {
                setError(err.message || "Inloggen mislukt");
              } finally {
                setLoading(false);
              }
            }
          : handleSubmit
        } className="space-y-3">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Naam huishouden"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              required
              className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
            />
          )}

          {mode === "join" && (
            <input
              type="text"
              placeholder="Uitnodigings-ID"
              value={invitationId}
              onChange={(e) => setInvitationId(e.target.value)}
              required
              className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
            />
          )}

          {(mode === "register" || mode === "join") && (
            <input
              type="text"
              placeholder="Naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
            />
          )}

          <input
            type="email"
            placeholder="E-mailadres"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />

          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />

          {error && mode !== "login" && <p className="text-[13px] text-ios-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-[14px] px-4 py-3 text-[17px] font-semibold disabled:opacity-50 ${
              mode === "login"
                ? "border border-ios-separator text-ios-label"
                : "bg-accent text-white"
            }`}
          >
            {loading
              ? "Even wachten..."
              : mode === "login"
                ? "Inloggen met wachtwoord"
                : mode === "register"
                  ? "Registreren"
                  : "Joinen"}
          </button>
        </form>

        <div className="flex justify-center gap-4 text-[13px] text-ios-secondary">
          {mode !== "login" && (
            <button onClick={() => { setMode("login"); setError(""); }} className="underline">
              Inloggen
            </button>
          )}
          {mode !== "register" && (
            <button onClick={() => { setMode("register"); setError(""); }} className="underline">
              Nieuw account
            </button>
          )}
          {mode !== "join" && (
            <button onClick={() => { setMode("join"); setError(""); }} className="underline">
              Joinen met uitnodiging
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Login page should show iOS-style inputs, lavender buttons, system gray background.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/pages/Login.tsx
git commit -m "feat: iOS styling for login page and loading state"
```

---

### Task 4: Update MealPlanner.tsx

**Files:**
- Modify: `packages/client/src/pages/MealPlanner.tsx`

- [ ] **Step 1: Update MealPlanner.tsx**

Replace the JSX return in `packages/client/src/pages/MealPlanner.tsx` (from `return (` to the closing `);` of the return statement, starting at approx line 227). Keep all logic/state/functions unchanged — only replace the returned JSX:

```tsx
  if (loading) {
    return <p className="py-12 text-center text-[13px] text-ios-secondary">Laden...</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[34px] font-bold leading-tight text-ios-label">Weekplanner</h1>
        <p className="text-[13px] text-ios-secondary">{getWeekLabel()}</p>
      </div>

      {/* Store selector — iOS segmented control */}
      <div className="mb-5 flex rounded-[9px] bg-ios-segmented-bg p-0.5">
        {STORES.map((s) => (
          <button
            key={s}
            onClick={() => updateStore(s)}
            className={`flex-1 rounded-[7px] py-[7px] text-[13px] font-semibold transition ${
              store === s
                ? "bg-white text-ios-label shadow-sm"
                : "text-ios-label"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {!plan ? (
        <>
          <div className="py-12 text-center">
            <p className="text-[17px] text-ios-secondary">Nog geen weekplan.</p>
            <p className="mt-1 text-[13px] text-ios-tertiary">
              Maak een plan en voeg recepten toe.
            </p>
            <button
              onClick={createPlan}
              disabled={creating}
              className="mt-4 rounded-[14px] bg-accent px-5 py-3 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {creating ? "Bezig..." : "Nieuw weekplan"}
            </button>
          </div>

          {recommendations.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Suggesties</p>
              <div className="space-y-2">
                {recommendations.map((rec, i) => (
                  <div key={i} className="rounded-[12px] bg-white p-4">
                    <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
                    {rec.description && (
                      <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
                    )}
                    {rec.discountMatches.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {rec.discountMatches.map((d, j) => (
                          <span key={j} className="rounded-[4px] bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">
                            korting: {d}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Recipes in plan */}
          {plan.recipes.length === 0 ? (
            <div className="rounded-[12px] border-2 border-dashed border-ios-tertiary py-8 text-center">
              <p className="text-[15px] text-ios-secondary">
                Nog geen recepten toegevoegd.
              </p>
            </div>
          ) : (
            <div className="mb-4 overflow-hidden rounded-[12px] bg-white">
              {plan.recipes.map((r, idx) => (
                <div
                  key={r.recipeId}
                  className={`flex min-h-[44px] items-center justify-between px-4 py-3 ${
                    idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
                  }`}
                >
                  <div>
                    <h3 className="text-[17px] text-ios-label">{r.title}</h3>
                    <div className="mt-0.5 flex items-center gap-3 text-[13px] text-ios-secondary">
                      <label className="flex items-center gap-1">
                        <span>Porties:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={r.servings}
                          onChange={(e) =>
                            updateRecipeInPlan(r.recipeId, {
                              servings: parseInt(e.target.value) || 1,
                            })
                          }
                          className="w-12 rounded-[8px] border border-ios-separator px-2 py-0.5 text-center text-[13px] text-ios-label"
                        />
                      </label>
                      <select
                        value={r.day || ""}
                        onChange={(e) =>
                          updateRecipeInPlan(r.recipeId, {
                            day: e.target.value || null,
                          })
                        }
                        className="rounded-[8px] border border-ios-separator px-2 py-0.5 text-[13px] text-ios-secondary"
                      >
                        <option value="">Geen dag</option>
                        {DAYS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.day && (
                      <span className="rounded-[6px] bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                        {r.day}
                      </span>
                    )}
                    <button
                      onClick={() => removeRecipeFromPlan(r.recipeId)}
                      className="text-ios-destructive"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add recipe */}
          {showSearch ? (
            <div className="mb-4">
              <input
                type="search"
                placeholder="Zoek een recept..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="mb-2 w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
              />
              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-[12px] bg-white">
                  {searchResults.map((r, idx) => (
                    <button
                      key={r.id}
                      onClick={() => addRecipeToPlan(r)}
                      className={`flex w-full min-h-[44px] items-center justify-between px-4 py-3 text-left ${
                        idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
                      }`}
                    >
                      <span className="text-[17px] text-ios-label">{r.title}</span>
                      <span className="text-[13px] text-ios-secondary">{r.servings} pers.</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="mt-2 text-[13px] text-ios-secondary"
              >
                Annuleren
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="mb-4 w-full rounded-[12px] border-2 border-dashed border-ios-tertiary py-3 text-[15px] font-medium text-accent"
            >
              + Recept toevoegen
            </button>
          )}

          {/* Generate list button */}
          {plan.recipes.length > 0 && (
            <button
              onClick={generateList}
              disabled={generating}
              className="w-full rounded-[14px] bg-accent py-4 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {generating ? "Lijst genereren..." : "Boodschappenlijst maken"}
            </button>
          )}

          {/* Suggestions */}
          {recommendations.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Suggesties</p>
              <div className="space-y-2">
                {recommendations.map((rec, i) => (
                  <div key={i} className="rounded-[12px] bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
                        {rec.description && (
                          <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
                        )}
                        {rec.discountMatches.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {rec.discountMatches.map((d, j) => (
                              <span key={j} className="rounded-[4px] bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">
                                korting: {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {rec.isExisting && rec.existingRecipeId && (
                        <button
                          onClick={() => addSuggestionToPlan(rec)}
                          className="ml-2 shrink-0 rounded-[8px] bg-accent px-3 py-1.5 text-[13px] font-semibold text-white"
                        >
                          + Plan
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
```

- [ ] **Step 2: Verify in browser**

MealPlanner should show large title, segmented store control, grouped list for recipes, lavender buttons and badges.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/MealPlanner.tsx
git commit -m "feat: iOS styling for meal planner page"
```

---

### Task 5: Update DiscountBadge, CategoryGroup, and GroceryItemRow

**Files:**
- Modify: `packages/client/src/components/DiscountBadge.tsx`
- Modify: `packages/client/src/components/CategoryGroup.tsx`
- Modify: `packages/client/src/components/GroceryItemRow.tsx`

- [ ] **Step 1: Update DiscountBadge.tsx**

Replace the full file:

```tsx
interface DiscountBadgeProps {
  discountInfo: {
    percentage: number;
    originalPrice: number;
    salePrice: number;
  } | null;
}

export default function DiscountBadge({ discountInfo }: DiscountBadgeProps) {
  if (!discountInfo || discountInfo.percentage <= 0) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
      -{discountInfo.percentage}%
    </span>
  );
}
```

- [ ] **Step 2: Update CategoryGroup.tsx**

Replace the full file:

```tsx
import { useState } from "react";

interface CategoryGroupProps {
  category: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function CategoryGroup({
  category,
  count,
  children,
  defaultOpen = true,
}: CategoryGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between bg-ios-category-bg px-4 py-2"
      >
        <span className="text-[13px] font-semibold text-ios-label">{category}</span>
        <span className="flex items-center gap-1 text-[12px] text-ios-secondary">
          <span>{count} items</span>
          <svg
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Update GroceryItemRow.tsx**

Replace the full file:

```tsx
import DiscountBadge from "./DiscountBadge";

interface DiscountInfo {
  percentage: number;
  originalPrice: number;
  salePrice: number;
}

interface GroceryItemRowProps {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  source: "recept" | "basis" | "handmatig";
  checked: boolean;
  discountInfo?: DiscountInfo | null;
  onToggle: (id: string) => void;
}

const sourceBadgeColors: Record<string, string> = {
  recept: "bg-source-recept-bg text-source-recept-text",
  basis: "bg-source-basis-bg text-source-basis-text",
  handmatig: "bg-source-handmatig-bg text-source-handmatig-text",
};

export default function GroceryItemRow({
  id,
  name,
  quantity,
  unit,
  source,
  checked,
  discountInfo,
  onToggle,
}: GroceryItemRowProps) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="flex w-full min-h-[44px] items-center gap-3 border-b border-ios-separator/50 px-4 py-3 text-left transition active:bg-ios-category-bg"
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          checked
            ? "border-accent bg-accent text-white"
            : "border-ios-tertiary"
        }`}
      >
        {checked && (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-[17px] ${checked ? "text-ios-tertiary line-through" : "text-ios-label"}`}>
          {name}
        </span>
      </div>
      <DiscountBadge discountInfo={discountInfo ?? null} />
      <span className={`text-[13px] ${checked ? "text-ios-tertiary line-through" : "text-ios-secondary"}`}>
        {quantity} {unit}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sourceBadgeColors[source] ?? "bg-ios-category-bg text-ios-secondary"}`}
      >
        {source}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Verify in browser**

Navigate to the grocery list — category headers should be flat strips, items should have round check circles, lavender accent on checked state, updated source badge colors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/DiscountBadge.tsx packages/client/src/components/CategoryGroup.tsx packages/client/src/components/GroceryItemRow.tsx
git commit -m "feat: iOS styling for discount badge, category groups, and grocery items"
```

---

### Task 6: Update GroceryList.tsx

**Files:**
- Modify: `packages/client/src/pages/GroceryList.tsx`

- [ ] **Step 1: Update the JSX return**

Replace everything from the `if (loading)` block (line 118) to the end of the component. Keep all logic/state/functions above unchanged:

```tsx
  if (loading) {
    return <p className="py-12 text-center text-[13px] text-ios-secondary">Laden...</p>;
  }

  if (!list) {
    return (
      <div>
        <h1 className="text-[34px] font-bold text-ios-label">Boodschappen</h1>
        <div className="py-12 text-center">
          <p className="text-[17px] text-ios-secondary">Geen boodschappenlijst gevonden.</p>
          <p className="mt-1 text-[13px] text-ios-tertiary">
            Maak eerst een weekplan en genereer een lijst.
          </p>
          <button
            onClick={() => navigate("/planner")}
            className="mt-4 rounded-[14px] bg-accent px-5 py-3 text-[17px] font-semibold text-white"
          >
            Naar weekplanner
          </button>
        </div>
      </div>
    );
  }

  const totalItems = list.items.length;
  const checkedItems = list.items.filter((i) => i.checked).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-bold leading-tight text-ios-label">Boodschappen</h1>
          <p className="text-[13px] text-ios-secondary">
            {checkedItems}/{totalItems} afgevinkt
          </p>
          <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-ios-segmented-bg">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${totalItems > 0 ? (checkedItems / totalItems) * 100 : 0}%` }}
            />
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-white"
        >
          + Item
        </button>
      </div>

      {/* Add item form */}
      {showAdd && (
        <div className="mb-4 overflow-hidden rounded-[12px] bg-white p-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Product naam"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              autoFocus
              className="flex-1 rounded-[8px] border border-ios-separator px-3 py-2 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
            />
            <input
              type="number"
              value={newItem.quantity}
              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
              className="w-16 rounded-[8px] border border-ios-separator px-2 py-2 text-center text-[15px] text-ios-label focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              className="w-16 rounded-[8px] border border-ios-separator px-2 py-2 text-center text-[15px] text-ios-label focus:border-accent focus:outline-none"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="text-[13px] text-ios-secondary"
            >
              Annuleren
            </button>
            <button
              onClick={addItem}
              className="rounded-[8px] bg-accent px-4 py-1.5 text-[13px] font-semibold text-white"
            >
              Toevoegen
            </button>
          </div>
        </div>
      )}

      {/* Items by category */}
      {categories.map((cat) => (
        <CategoryGroup key={cat} category={cat} count={grouped[cat].length}>
          {grouped[cat].map((item) => (
            <GroceryItemRow
              key={item.id}
              {...item}
              onToggle={toggleItem}
            />
          ))}
        </CategoryGroup>
      ))}

      {/* Start shopping */}
      <button
        onClick={() => navigate("/shop")}
        className="mt-4 w-full rounded-[14px] bg-accent py-4 text-[17px] font-semibold text-white"
      >
        Winkelen starten
      </button>
    </div>
  );
```

- [ ] **Step 2: Verify in browser**

Grocery list should show large title, progress bar, iOS-styled categories and items.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/GroceryList.tsx
git commit -m "feat: iOS styling for grocery list page"
```

---

### Task 7: Update ShoppingMode.tsx

**Files:**
- Modify: `packages/client/src/pages/ShoppingMode.tsx`

- [ ] **Step 1: Update the JSX return**

Replace everything from the `if (loading)` block (line 117) to the end of the component. Keep all logic/state/functions above unchanged:

```tsx
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-white text-[15px] text-ios-secondary">
                Laden...
            </div>
        );
    }

    if (!list) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-white px-4">
                <p className="text-[17px] text-ios-secondary">Geen boodschappenlijst gevonden.</p>
                <button
                    onClick={() => navigate("/list")}
                    className="mt-4 rounded-[14px] bg-accent px-5 py-3 text-[17px] font-semibold text-white"
                >
                    Terug naar lijst
                </button>
            </div>
        );
    }

    const unchecked = list.items.filter((i) => !i.checked);
    const checked = list.items.filter((i) => i.checked);
    const total = list.items.length;
    const done = checked.length;
    const progress = total > 0 ? (done / total) * 100 : 0;

    const grouped = unchecked.reduce<Record<string, GroceryItem[]>>((acc, item) => {
        const cat = item.category || "Overig";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});
    const categories = Object.keys(grouped).sort();

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
            {/* Offline indicator */}
            {!isOnline && (
                <div className="bg-[#FFCC00] px-4 py-2 text-center text-[13px] font-semibold text-[#1D1D1F]">
                    Offline — wijzigingen worden opgeslagen
                </div>
            )}

            {/* Header */}
            <div className="border-b border-ios-separator bg-[rgba(249,249,249,0.94)] px-4 pb-3 pt-4 backdrop-blur-[20px]">
                <div className="mx-auto flex max-w-lg items-center gap-3">
                    <button
                        onClick={() => navigate("/list")}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ios-secondary"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center justify-between text-[15px] font-semibold text-ios-label">
                            <span>Winkelen</span>
                            <span className="text-[13px] font-normal text-ios-secondary">
                                {done}/{total} items
                            </span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ios-segmented-bg">
                            <div
                                className="h-full rounded-full bg-accent transition-all duration-300"
                                style={{width: `${progress}%`}}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 pb-32">
                <div className="mx-auto max-w-lg">
                    {categories.map((cat) => (
                        <div key={cat} className="mt-4">
                            <div className="sticky top-0 z-10 bg-white py-1">
                                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">
                                    {cat}
                                </h3>
                            </div>
                            {grouped[cat].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => toggleItem(item.id)}
                                    className="flex w-full min-h-[44px] items-center gap-3 border-b border-ios-separator/30 py-3 text-left active:bg-ios-category-bg"
                                >
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ios-tertiary"/>
                                    <span className="flex-1 text-[17px] text-ios-label">
                                        {item.name}
                                    </span>
                                    <DiscountBadge discountInfo={item.discountInfo ?? null}/>
                                    <span className="text-[13px] text-ios-secondary">
                                        {item.quantity} {item.unit}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ))}

                    {/* Checked items */}
                    {checked.length > 0 && (
                        <div className="mt-6">
                            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-tertiary">
                                Afgevinkt ({checked.length})
                            </h3>
                            {checked.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => toggleItem(item.id)}
                                    className="flex w-full min-h-[44px] items-center gap-3 border-b border-ios-separator/20 py-2 text-left"
                                >
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-accent bg-accent">
                                        <svg
                                            className="h-3.5 w-3.5 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={3}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                        </svg>
                                    </div>
                                    <span className="flex-1 text-[15px] text-ios-tertiary line-through">
                                        {item.name}
                                    </span>
                                    <span className="text-[13px] text-ios-tertiary line-through">
                                        {item.quantity} {item.unit}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom bar */}
            <div className="fixed inset-x-0 bottom-0 border-t border-ios-separator bg-[rgba(249,249,249,0.94)] px-4 pb-6 pt-3 backdrop-blur-[20px]">
                <div className="mx-auto max-w-lg space-y-2">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Item toevoegen..."
                            value={addText}
                            onChange={(e) => setAddText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addItem()}
                            className="flex-1 rounded-[12px] border border-ios-separator bg-white px-4 py-2.5 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
                        />
                        <button
                            onClick={addItem}
                            disabled={!addText.trim()}
                            className="rounded-[10px] bg-accent px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
                        >
                            +
                        </button>
                    </div>

                    {total > 0 && (
                        <button
                            onClick={async () => {
                                if (!list) return;
                                setFinalizing(true);
                                try {
                                    await apiFetch(`/lists/${list.id}/finalize`, {
                                        method: "POST",
                                    });
                                    navigate("/list");
                                } catch {
                                    setFinalizing(false);
                                }
                            }}
                            disabled={finalizing}
                            className="w-full rounded-[14px] bg-accent py-4 text-[17px] font-semibold text-white disabled:opacity-50"
                        >
                            {finalizing ? "Afronden..." : "Klaar met winkelen"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
```

- [ ] **Step 2: Verify in browser**

Shopping mode should show frosted glass header/footer, lavender progress bar, round check circles.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/ShoppingMode.tsx
git commit -m "feat: iOS styling for shopping mode"
```

---

### Task 8: Update Recipes.tsx, RecipeCard.tsx, RecipeDetail.tsx, ScrapeDialog.tsx

**Files:**
- Modify: `packages/client/src/pages/Recipes.tsx`
- Modify: `packages/client/src/components/RecipeCard.tsx`
- Modify: `packages/client/src/pages/RecipeDetail.tsx`
- Modify: `packages/client/src/components/ScrapeDialog.tsx`

- [ ] **Step 1: Update Recipes.tsx**

Replace the JSX return (from `return (` at line 51 to end of component):

```tsx
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[34px] font-bold text-ios-label">Recepten</h1>
        <button
          onClick={() => setShowScrape(true)}
          className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-white"
        >
          + Toevoegen
        </button>
      </div>

      <input
        type="search"
        placeholder="Zoek recepten..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
      />

      {loading ? (
        <p className="text-center text-[13px] text-ios-secondary">Laden...</p>
      ) : recipes.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[17px] text-ios-secondary">Nog geen recepten.</p>
          <p className="mt-1 text-[13px] text-ios-tertiary">
            Voeg een recept toe via een URL.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {recipes.map((r) => (
            <RecipeCard key={r.id} {...r} />
          ))}
        </div>
      )}

      <ScrapeDialog
        open={showScrape}
        onClose={() => setShowScrape(false)}
        onSaved={fetchRecipes}
      />
    </div>
  );
```

- [ ] **Step 2: Update RecipeCard.tsx**

Replace the full file:

```tsx
import { Link } from "react-router-dom";

interface RecipeCardProps {
  id: string;
  title: string;
  imageUrl: string | null;
  servings: number;
  tags: string[];
  timesCooked: number;
}

export default function RecipeCard({
  id,
  title,
  imageUrl,
  servings,
  tags,
  timesCooked,
}: RecipeCardProps) {
  return (
    <Link
      to={`/recipes/${id}`}
      className="block overflow-hidden rounded-[12px] bg-white shadow-sm transition hover:shadow-md"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="flex h-36 items-center justify-center bg-ios-category-bg text-3xl">
          🍽️
        </div>
      )}
      <div className="p-3">
        <h3 className="text-[15px] font-semibold text-ios-label line-clamp-2">{title}</h3>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-ios-secondary">
          <span>{servings} personen</span>
          {timesCooked > 0 && <span>· {timesCooked}x gekookt</span>}
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-medium text-accent"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Update RecipeDetail.tsx**

Replace the JSX return (from `return (` at line 102 to end of component):

```tsx
  return (
    <div>
      <button
        onClick={() => navigate("/recipes")}
        className="mb-3 text-[15px] text-accent"
      >
        &larr; Terug
      </button>

      {recipe.imageUrl && (
        <img
          src={recipe.imageUrl}
          alt={recipe.title}
          className="mb-4 h-48 w-full rounded-[12px] object-cover"
        />
      )}

      <h1 className="text-[34px] font-bold leading-tight text-ios-label">{recipe.title}</h1>

      <div className="mt-2 flex gap-3 text-[13px] text-ios-secondary">
        <span>{recipe.servings} personen</span>
        {recipe.prepTimeMinutes && <span>{recipe.prepTimeMinutes} min prep</span>}
        {recipe.cookTimeMinutes && <span>{recipe.cookTimeMinutes} min koken</span>}
      </div>

      {recipe.sourceUrl && (
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-[13px] text-accent underline"
        >
          Bron bekijken
        </a>
      )}

      <p className="mt-6 mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Ingredienten</p>
      <div className="overflow-hidden rounded-[12px] bg-white">
        {recipe.ingredients.map((ing, i) => (
          <div key={i} className={`flex min-h-[44px] items-center justify-between px-4 py-3 ${
            i > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
          }`}>
            <span className="text-[17px] text-ios-label">{ing.name}</span>
            <span className="text-[13px] text-ios-secondary">
              {ing.quantity} {ing.unit}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Bereiding</p>
      <ol className="space-y-3">
        {recipe.instructions.map((step) => (
          <li key={step.step} className="flex gap-3 text-[15px]">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-light text-[12px] font-semibold text-accent">
              {step.step}
            </span>
            <span className="text-ios-label">{step.text}</span>
          </li>
        ))}
      </ol>

      {added ? (
        <button
          onClick={() => navigate("/planner")}
          className="mt-8 w-full rounded-[14px] border border-accent bg-accent-light px-4 py-3 text-[15px] font-semibold text-accent"
        >
          ✓ Toegevoegd aan weekplan — Bekijk plan
        </button>
      ) : (
        <button
          onClick={handleAddToPlan}
          disabled={adding}
          className="mt-8 w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {adding ? "Toevoegen..." : "Toevoegen aan weekplan"}
        </button>
      )}

      <button
        onClick={handleDelete}
        className="mt-3 w-full rounded-[14px] border border-ios-destructive px-4 py-3 text-[15px] font-medium text-ios-destructive"
      >
        Recept verwijderen
      </button>
    </div>
  );
```

- [ ] **Step 4: Update ScrapeDialog.tsx**

Replace the full file:

```tsx
import { useState } from "react";
import { apiFetch } from "../api/client.js";

interface ScrapeDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ScrapeDialog({ open, onClose, onSaved }: ScrapeDialogProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/recipes/scrape", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      setUrl("");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Kon recept niet ophalen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-[16px] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-[20px] font-bold text-ios-label">Recept toevoegen</h2>
        <form onSubmit={handleScrape} className="space-y-4">
          <input
            type="url"
            placeholder="Plak een recept-URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            autoFocus
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          {error && <p className="text-[13px] text-ios-destructive">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[14px] border border-ios-separator px-4 py-3 text-[17px] font-semibold text-ios-label"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-[14px] bg-accent px-4 py-3 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Ophalen..." : "Recept ophalen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

Check recipes grid, recipe detail page (ingredients list, step numbers, buttons), and scrape dialog.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Recipes.tsx packages/client/src/components/RecipeCard.tsx packages/client/src/pages/RecipeDetail.tsx packages/client/src/components/ScrapeDialog.tsx
git commit -m "feat: iOS styling for recipes pages and components"
```

---

### Task 9: Update Staples.tsx

**Files:**
- Modify: `packages/client/src/pages/Staples.tsx`

- [ ] **Step 1: Update the JSX return**

Replace everything from the `if (loading)` block (line 129) to the end of the component:

```tsx
  if (loading) {
    return <p className="py-12 text-center text-[13px] text-ios-secondary">Laden...</p>;
  }

  const activeStaples = staples.filter((s) => s.active);
  const inactiveStaples = staples.filter((s) => !s.active);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[34px] font-bold text-ios-label">Basisproducten</h1>
        <p className="text-[13px] text-ios-secondary">
          Producten die je elke week op de lijst zet.
        </p>
      </div>

      {staples.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[17px] text-ios-secondary">Nog geen basisproducten.</p>
          <p className="mt-1 text-[13px] text-ios-tertiary">
            Voeg hieronder je eerste product toe.
          </p>
        </div>
      ) : (
        <>
          {activeStaples.length > 0 && (
            <div className="mb-4 overflow-hidden rounded-[12px] bg-white">
              {activeStaples.map((s, idx) => (
                <div
                  key={s.id}
                  className={`flex min-h-[44px] items-center gap-3 px-4 py-3 ${
                    idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
                  }`}
                >
                  <button
                    onClick={() => toggleActive(s)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent"
                  >
                    <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="text-[17px] text-ios-label">{s.name}</span>
                    <span className="ml-2 text-[13px] text-ios-secondary">
                      {s.defaultQuantity} {s.unit}
                    </span>
                  </div>
                  <span className="rounded-full bg-ios-category-bg px-2 py-0.5 text-[10px] text-ios-secondary">
                    {s.category}
                  </span>
                  <button
                    onClick={() => deleteStaple(s.id)}
                    className="text-ios-tertiary"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {inactiveStaples.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-tertiary">
                Inactief
              </p>
              <div className="overflow-hidden rounded-[12px] bg-white">
                {inactiveStaples.map((s, idx) => (
                  <div
                    key={s.id}
                    className={`flex min-h-[44px] items-center gap-3 px-4 py-3 ${
                      idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
                    }`}
                  >
                    <button
                      onClick={() => toggleActive(s)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ios-tertiary"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] text-ios-tertiary">{s.name}</span>
                      <span className="ml-2 text-[13px] text-ios-tertiary">
                        {s.defaultQuantity} {s.unit}
                      </span>
                    </div>
                    <span className="rounded-full bg-ios-category-bg px-2 py-0.5 text-[10px] text-ios-tertiary">
                      {s.category}
                    </span>
                    <button
                      onClick={() => deleteStaple(s.id)}
                      className="text-ios-tertiary"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add form */}
      <div className="mt-4 overflow-hidden rounded-[12px] bg-white p-4">
        <h3 className="mb-3 text-[15px] font-semibold text-ios-label">
          Product toevoegen
        </h3>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Naam (bijv. Melk)"
            value={form.name}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              autoCategorizeName(e.target.value);
            }}
            className="w-full rounded-[8px] border border-ios-separator px-3 py-2.5 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Aantal"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="w-20 rounded-[8px] border border-ios-separator px-2 py-2.5 text-center text-[13px] text-ios-label focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              placeholder="Eenheid"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="w-20 rounded-[8px] border border-ios-separator px-2 py-2.5 text-center text-[13px] text-ios-label focus:border-accent focus:outline-none"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="flex-1 rounded-[8px] border border-ios-separator px-2 py-2.5 text-[13px] text-ios-label focus:border-accent focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <button
            onClick={addStaple}
            disabled={!form.name.trim()}
            className="w-full rounded-[14px] bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 2: Verify in browser**

Staples page should show grouped list with check circles, iOS styling on add form.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Staples.tsx
git commit -m "feat: iOS styling for staples page"
```

---

### Task 10: Update Settings.tsx

**Files:**
- Modify: `packages/client/src/pages/Settings.tsx`

- [ ] **Step 1: Update the JSX return**

Replace the JSX return (from `return (` at line 215 to end of component):

```tsx
  return (
    <div>
      <h1 className="mb-4 text-[34px] font-bold text-ios-label">Instellingen</h1>

      {/* Household info */}
      <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Huishouden</p>
      <section className="mb-6 overflow-hidden rounded-[12px] bg-white">
        <div className="flex min-h-[44px] items-center justify-between px-4 py-3">
          <span className="text-[17px] text-ios-label">Naam</span>
          <span className="text-[17px] text-ios-secondary">
            {household?.name || "\u2014"}
          </span>
        </div>
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
        <div className="ml-4 flex min-h-[44px] items-center justify-between border-t border-ios-separator py-3 pr-4">
          <span className="text-[17px] text-ios-label">Ingelogd als</span>
          <span className="text-[17px] text-ios-secondary">
            {user?.name || user?.email || "\u2014"}
          </span>
        </div>
      </section>

      {/* Preferred store */}
      <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Voorkeurswinkel</p>
      <section className="mb-6 overflow-hidden rounded-[12px] bg-white p-4">
        <div className="flex rounded-[9px] bg-ios-segmented-bg p-0.5">
          {STORES.map((s) => (
            <button
              key={s}
              onClick={() => updateStore(s)}
              className={`flex-1 rounded-[7px] py-[7px] text-[13px] font-semibold transition ${
                store === s
                  ? "bg-white text-ios-label shadow-sm"
                  : "text-ios-label"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Members */}
      <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Leden</p>
      <section className="mb-6 overflow-hidden rounded-[12px] bg-white">
        {members.length === 0 ? (
          <p className="px-4 py-3 text-[15px] text-ios-tertiary">Laden...</p>
        ) : (
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
              <span className="text-[17px] text-ios-label">{m.name}</span>
              {m.id === user?.id && (
                <span className="text-[13px] text-ios-tertiary">(jij)</span>
              )}
            </div>
          ))
        )}
      </section>

      {/* Category ordering */}
      <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Categorievolgorde</p>
      <section className="mb-6 overflow-hidden rounded-[12px] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] text-ios-secondary">
            Sleep categorie&euml;n om de volgorde aan te passen voor{" "}
            <span className="font-semibold text-ios-label">{store}</span>.
          </p>
          <button
            onClick={resetCategoryOrder}
            className="rounded-[8px] bg-ios-category-bg px-3 py-1 text-[13px] text-ios-secondary"
          >
            Reset
          </button>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={categories}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {categories.map((category) => (
                <SortableItem key={category} id={category} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </section>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full rounded-[14px] border border-ios-destructive py-3 text-[15px] font-medium text-ios-destructive"
      >
        Uitloggen
      </button>
    </div>
  );
```

- [ ] **Step 2: Update SortableItem styling**

In the same file, update the `SortableItem` component (around line 59-95):

```tsx
function SortableItem({ id }: { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex min-h-[44px] items-center gap-3 rounded-[10px] border px-4 py-3 text-[15px] ${
        isDragging
          ? "z-10 border-accent bg-accent-light shadow-md"
          : "border-ios-separator bg-white"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-ios-tertiary select-none"
        aria-label="Versleep"
      >
        ≡
      </span>
      <span className="text-ios-label">{id}</span>
    </li>
  );
}
```

- [ ] **Step 3: Verify in browser**

Settings page should show grouped inset lists, segmented store control, lavender member avatars, iOS-styled sortable items, red outline logout button.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Settings.tsx
git commit -m "feat: iOS styling for settings page"
```

---

### Task 11: Typecheck and final verification

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

```bash
pnpm --filter @weekboodschappen/client run typecheck
```

Fix any type errors that come up.

- [ ] **Step 2: Visual walkthrough**

Open http://localhost:5173 and check each page:
1. Login — large title, lavender passkey button, iOS inputs
2. Planner — segmented control, grouped recipe list, suggestion cards
3. Grocery List — progress bar, category groups, check circles
4. Shopping Mode — frosted glass header/footer, check circles
5. Recipes — grid with updated tag pills
6. Recipe Detail — grouped ingredient list, lavender step numbers
7. Staples — check circles, grouped list, add form
8. Settings — grouped sections, segmented control, member avatars
9. Tab bar — outline icons, frosted glass, lavender active state

- [ ] **Step 3: Commit any fixes**

```bash
git add -u packages/client/src/
git commit -m "fix: resolve typecheck and visual issues from iOS redesign"
```
