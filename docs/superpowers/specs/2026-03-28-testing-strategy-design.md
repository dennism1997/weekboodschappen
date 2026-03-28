# Testing Strategy Design

## Overview

Add integration and component tests to the weekboodschappen app, focused on backend API routes (primary) and a few critical frontend components (secondary). Goal: confidence when refactoring and catching regressions.

## Test Framework

**Vitest** for both server and client packages. Single framework for the whole monorepo.

## Backend Testing

### Approach

API-level integration tests: spin up the Express app with a temporary file-based SQLite database, make real HTTP requests via `supertest`, assert on responses and database state. No mocking of the database or ORM.

### Test Database

- Each test file gets a fresh temporary file-based SQLite DB in `$TMPDIR`.
- Drizzle migrations run before tests to set up the schema.
- The DB file is deleted after the test suite completes.
- WAL mode enabled, matching production config.

### Auth in Tests

A helper module (`packages/server/src/test/setup.ts`) that:

- Creates a temporary SQLite database with migrations applied.
- Provides `createTestUser(name, role?)` — inserts a user + account + organization + member directly into the DB, returns `{ userId, orgId }`.
- Provides `createTestSession(userId, orgId)` — inserts a session row directly, returns session token cookie string for use in HTTP requests.
- Provides `getTestApp()` — returns the Express app configured to use the test database.

This bypasses better-auth's sign-up/sign-in flow (which requires crypto, cookie signing, etc.) while still testing real middleware, routes, and database queries.

### What to Test

**Admin routes** (`admin.test.ts`):
- `GET /api/admin/status` — returns `isAdmin: true` for the first user, `false` for others.
- `GET /api/admin/households` — returns all households with member counts, recipe counts, last activity.
- `PATCH /api/admin/households/:id/status` — approving a waiting household sets status to active.
- `DELETE /api/admin/households/:id` — deletes household and all related data (cascade).
- `GET /api/admin/users` — returns all users with memberships and last login.
- `POST /api/admin/users/:id/reset-passkey` — removes passkeys for a user.
- `GET /api/admin/system` — returns DB size, discount refresh time, AI call count.
- Non-admin users get 403 on all protected endpoints.

**Registration flow** (`register.test.ts`):
- `POST /api/register` — creates user + organization with status "waiting".
- `GET /api/register/status` — returns `available: true` when setup is complete, `false` when no users exist.
- Validation: rejects missing name or household name.

**Auth middleware** (`auth-middleware.test.ts`):
- Requests with a valid session + active household pass through.
- Requests with a waiting household return 403 `HOUSEHOLD_PENDING`.
- Requests with a deactivated household return 403 `HOUSEHOLD_DEACTIVATED`.
- Requests without a session return 401.

**Setup flow** (`setup-flow.test.ts`):
- `POST /api/setup` — creates first user + active organization.
- `GET /api/setup/status` — returns `needsSetup: true` when no users, `false` after setup.
- Prevents double setup (returns 403 if users exist).

**Invite flow** (`invite.test.ts`):
- `POST /api/invite/create` — creates invitation with 7-day expiry.
- `GET /api/invite/:token` — validates active invite.
- Expired invites return 410.
- Used invites return 410.
- `GET /api/invite/members` — returns members with last login.
- `DELETE /api/invite/members/:userId` — owner can remove members, non-owner gets 403.

**Plans & lists** (`plans.test.ts`):
- `POST /api/plans` — creates a plan for the household.
- `POST /api/plans/:id/generate-list` — generates a grocery list from plan recipes.
- `PATCH /api/lists/:id/items/:itemId` — checking/unchecking items.

## Frontend Testing

### Approach

Component tests using **React Testing Library** (`@testing-library/react`). Render components with mocked API responses, assert on user interactions and rendered output.

API mocking: simple `vi.mock` of the `apiFetch` function rather than MSW — keeps setup minimal and tests focused.

### Test Setup

A helper module (`packages/client/src/test/setup.ts`) that:

- Creates a `QueryClient` with `retry: false` for tests.
- Provides `renderWithProviders(component)` — wraps in `QueryClientProvider`, `MemoryRouter`.
- Mocks `apiFetch` to return controlled data.

### What to Test

**Admin page** (`Admin.test.tsx`):
- Renders pending households with approve/reject buttons.
- Renders active households with member count, recipe count.
- Approve button calls correct API endpoint.
- Shows system health metrics.

**Waiting page** (`Waiting.test.tsx`):
- Renders waiting message.
- Refresh button triggers page reload.
- Redirects to login when not authenticated.

**Register page** (`Register.test.tsx`):
- Renders form with name and household name inputs.
- Validates empty fields.
- After submit, transitions to passkey setup step.
- "Al een account?" link navigates to /login.

## File Structure

```
packages/server/
  vitest.config.ts
  src/test/
    setup.ts              — DB helpers, auth helpers, test app factory
    admin.test.ts
    register.test.ts
    auth-middleware.test.ts
    setup-flow.test.ts
    invite.test.ts
    plans.test.ts

packages/client/
  vitest.config.ts
  src/test/
    setup.ts              — render helpers, query client, router mock
    Admin.test.tsx
    Waiting.test.tsx
    Register.test.tsx
```

## Dependencies to Add

**Server** (`packages/server`):
- `vitest` (dev)
- `supertest` + `@types/supertest` (dev)

**Client** (`packages/client`):
- `vitest` (dev)
- `@testing-library/react` (dev)
- `@testing-library/jest-dom` (dev)
- `@testing-library/user-event` (dev)
- `jsdom` (dev)

## Scripts

Add to both `packages/server/package.json` and `packages/client/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Add to root `package.json`:

```json
{
  "scripts": {
    "test": "pnpm -r run test"
  }
}
```

## Out of Scope

- E2E browser tests (Playwright) — too heavy for now
- Testing discount scrapers — depend on external APIs
- Testing AI categorization — depends on Anthropic API
- Snapshot tests — brittle, low value
- Testing WebSocket events — complex setup, low regression risk
