# Passkey-Only Auth with Invite Links

## Goal

Replace email/password authentication with passkey-only auth. New users join via one-time invite links shared manually (WhatsApp, iMessage, etc.). The first user bootstraps via a setup flow.

## Auth Flows

### 1. First-time setup

For the very first user when no accounts exist yet.

1. User opens the app → client calls `GET /api/auth/setup/status`
2. If `{ needsSetup: true }`, redirect to `/setup`
3. User enters name + household name
4. `POST /api/auth/setup` creates: user record, organization, membership (role: owner), session
5. Client prompts passkey registration via `authClient.passkey.addPasskey()`
6. Redirect to `/planner`

**Security:** `POST /api/auth/setup` returns 403 if any user already exists in the database.

### 2. Invite & join

For subsequent household members.

1. Existing user goes to Settings → clicks "Uitnodigingslink maken"
2. `POST /api/invite/create` generates a cryptographically random token (32 bytes, hex-encoded), stores it in the `invitation` table with 7-day expiry, returns the full invite URL
3. User copies and shares the URL (e.g. `https://mouwen.casa/invite/abc123def456`)
4. New user opens the link → client renders `/invite/:token` page
5. Client calls `GET /api/invite/:token` to validate → returns `{ valid, householdName }` or error
6. New user enters their name
7. `POST /api/invite/:token/accept` with `{ name }`:
   - Validates token exists, is not expired, status is "pending"
   - Creates user record (email = `{userId}@passkey.local` placeholder since better-auth requires it)
   - Creates session
   - Adds user as member of the organization
   - Marks invitation status as "accepted"
   - Returns session
8. Client prompts passkey registration
9. Redirect to `/planner`

**Security:** Tokens are single-use and expire after 7 days. The accept endpoint is rate-limited.

### 3. Returning user login

No changes to existing flow.

1. User opens app → tap "Inloggen met passkey" → done

## Server Changes

### `auth.ts`

- Set `emailAndPassword: { enabled: false }`
- Remove `ALLOWED_EMAILS` logic and env var

### New: `routes/setup.ts`

Endpoints:
- `GET /api/auth/setup/status` — public, returns `{ needsSetup: boolean }`
- `POST /api/auth/setup` — public, accepts `{ name, householdName }`, only works when zero users exist

Implementation:
- Check user count in DB; if > 0, return 403
- Generate a unique ID for user
- Create user with email `{id}@setup.local` (better-auth requires email field)
- Use better-auth's internal API or direct DB insert to create user + account
- Create organization with provided household name + random slug
- Create membership with role "owner"
- Create session via better-auth's session management
- Set session cookie and return

### New: `routes/invite.ts`

Endpoints:
- `POST /api/invite/create` — authenticated, creates invite token
- `GET /api/invite/:token` — public, validates token
- `POST /api/invite/:token/accept` — public, accepts `{ name }`, creates user and joins household

Implementation details:
- Token: 32 bytes from `crypto.randomBytes()`, hex-encoded (64 chars)
- Stored in existing `invitation` table: token goes in `id` field, or we add a `token` column
- Uses existing `invitation` table fields: `organizationId`, `email` (set to placeholder), `status`, `expiresAt`, `inviterId`
- Accept: validate token → create user → create session → add member → update invitation status

### `useAuth.ts` cleanup

- Remove `signUp` and `signIn` email exports

## Client Changes

### `Login.tsx` — simplify

Remove all email/password UI:
- Remove email, password, name, householdName, invitationId state
- Remove register/join modes — only "login" mode remains
- Remove the email/password form entirely
- Keep only the "Inloggen met passkey" button
- Add a small link at the bottom: "Eerste keer? Vraag een uitnodigingslink"

### New: `pages/Setup.tsx`

Route: `/setup`

- On mount, check `GET /api/auth/setup/status`; if not needed, redirect to `/login`
- Form with: name input, household name input, submit button
- On submit: call setup endpoint → prompt passkey registration → redirect to `/planner`

### New: `pages/Invite.tsx`

Route: `/invite/:token`

- On mount, call `GET /api/invite/:token` to validate
- If invalid/expired, show error message
- If valid, show household name + name input form
- On submit: call accept endpoint → prompt passkey registration → redirect to `/planner`

### `Settings.tsx` — update invite section

Replace slug-copy with:
- "Uitnodigingslink maken" button → calls `POST /api/invite/create`
- Shows the generated URL in a copyable field
- Button changes to "Gekopieerd!" feedback on copy

### Router updates

Add routes:
- `/setup` → `Setup.tsx`
- `/invite/:token` → `Invite.tsx`

## What stays the same

- better-auth core: sessions, cookie management, CSRF
- better-auth passkey plugin + `@simplewebauthn/server`
- Organization/membership model and all org-related APIs
- Drizzle adapter and all existing DB schema tables
- Auth middleware on protected routes
- All non-auth pages and functionality

## Migration notes

- Existing users with email/password accounts can still log in via passkey if they registered one
- Users without a passkey will need a new invite link to re-register (or a manual DB intervention)
- The `account` table will still have old `credential` provider entries — these are harmless
