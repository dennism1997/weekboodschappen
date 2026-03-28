# Admin Panel Design

## Overview

A mobile-first admin section at `/admin` for the app owner to manage households, users, and system health. Includes a self-service household registration flow with approval, and Pushover notifications for key events.

## Access & Authorization

- The **app admin** is the first user created during `/setup` (earliest `createdAt` in the `user` table).
- A new `requireAdmin` middleware checks if the authenticated user is the admin.
- The `/admin` route is only visible in the bottom nav for the admin user.
- Non-admin users accessing `/admin` are redirected to `/planner`.

## Household Registration Flow

### Self-Service Request (`/register`)

1. New user visits `/register` (public page).
2. They enter their **name** and **household name**.
3. The server creates the user via Better Auth's `signUp.email` (with an auto-generated email/password, same pattern as `/setup`), then the user registers a passkey (same as current onboarding).
4. The server creates:
   - A `user` record.
   - An `organization` record with `status: "waiting"`.
   - A `member` record with `role: "owner"`.
4. A **Pushover notification** is sent to the admin: _"New household request: {household name}"_.
5. The user is logged in automatically.

### Waiting State

- When a user logs in and their household has `status: "waiting"`, they see a **"Waiting for approval"** screen at `/waiting`.
- The screen shows a simple message and a refresh button.
- All app API routes return **403** (with a specific error code like `HOUSEHOLD_PENDING`) when the household is in `"waiting"` state.
- Auth routes (`/api/auth/*`) remain accessible regardless of household status.

### Approval

- Admin approves in `/admin` → organization `status` changes to `"active"`.
- On next refresh/API call, the user enters the app normally.

### Rejection

- Admin rejects → organization and its members are deleted.

## Database Changes

### Modified Table: `organization`

Add a `status` column:

| Column   | Type   | Values                                    | Default     |
|----------|--------|-------------------------------------------|-------------|
| `status` | `text` | `"active"`, `"waiting"`, `"deactivated"` | `"waiting"` |

- The `/setup` flow (first user creation) sets status to `"active"` directly.
- The `/register` flow sets status to `"waiting"`.
- No new tables are needed.

### Migration

- Add `status` column to `organization` table with default `"waiting"`.
- Update all existing organizations to `"active"` (backward compatibility).

## Admin Page (`/admin`)

A single page with vertically stacked sections. Mobile-first, no tabs or sidebar.

### Section 1: Pending Approval

- Shows households with `status: "waiting"`.
- Each entry displays: household name, time since request, member count.
- Actions: **Approve** button, **Reject** button (with confirmation).
- Badge showing pending count.
- Hidden when no pending households.

### Section 2: Households

- Lists all active and deactivated households.
- Each entry shows: name, member count, last activity date, recipe count.
- Tap to expand a household to see:
  - List of members (name, role).
  - **Deactivate** / **Reactivate** toggle button.
  - **Delete** button (with confirmation dialog — warns that all household data will be removed).
- Deactivated households are visually dimmed.

### Section 3: Users

- Lists all users across all households.
- Each entry shows: name, household name(s), role, last login date.
- Actions per user:
  - **Reset passkey** — removes all passkeys, forces re-registration.
  - **Remove from household** — removes membership (with confirmation).

### Section 4: System Health

Displays key system metrics:

| Metric                  | Source                                                       |
|-------------------------|--------------------------------------------------------------|
| Database file size      | `fs.stat` on the SQLite file                                 |
| Discount scraper status | Last successful run time + any error from last run           |
| AI API call count       | In-memory counter on the AI service, reset on server restart |
| Last scraper error      | Stored error message from most recent failure, if any        |

## API Routes

### Admin Routes (all require `requireAdmin` middleware)

| Method   | Route                              | Description                         |
|----------|------------------------------------|-------------------------------------|
| `GET`    | `/api/admin/households`            | List all households with stats      |
| `PATCH`  | `/api/admin/households/:id/status` | Update household status             |
| `DELETE` | `/api/admin/households/:id`        | Delete household and all its data   |
| `GET`    | `/api/admin/users`                 | List all users with household info  |
| `POST`   | `/api/admin/users/:id/reset-passkey` | Reset user's passkeys             |
| `DELETE` | `/api/admin/users/:id/membership/:orgId` | Remove user from household   |
| `GET`    | `/api/admin/system`                | Get system health metrics           |

### Public Routes (new/modified)

| Method | Route                  | Description                                |
|--------|------------------------|--------------------------------------------|
| `POST` | `/api/register`        | Create new user + waiting household        |
| `GET`  | `/api/register/status` | Check if registration is available         |

### Modified Middleware

- `requireAuth` middleware: after validating the session, check the active organization's `status`. If `"waiting"`, return `403` with `{ error: "HOUSEHOLD_PENDING" }`. If `"deactivated"`, return `403` with `{ error: "HOUSEHOLD_DEACTIVATED" }`.
- Exception: auth routes and `/api/register` are not affected.

## Pushover Integration

### Configuration

New environment variables:

| Variable              | Description                    |
|-----------------------|--------------------------------|
| `PUSHOVER_USER_KEY`   | Your Pushover user key         |
| `PUSHOVER_API_TOKEN`  | Pushover application API token |

Both are optional — if not set, Pushover notifications are silently skipped.

### Service: `pushover.ts`

A small service that sends notifications via the [Pushover API](https://pushover.net/api) (`POST https://api.pushover.net/1/messages.json`).

### Notification Triggers

| Event                        | Message                                            | Priority |
|------------------------------|-----------------------------------------------------|----------|
| New household request        | "New household request: {name}"                    | Normal   |
| Discount scraper failure     | "Discount scraper failed: {error}"                 | High     |
| Database size > 100MB        | "Database size warning: {size}MB"                  | Normal   |

- Scraper failure notifications are sent when the daily cron job fails.
- Database size is checked during the daily cron job.

## Frontend Routes

| Route        | Access    | Description                                   |
|--------------|-----------|-----------------------------------------------|
| `/register`  | Public    | New household request form                    |
| `/admin`     | Admin     | Admin dashboard (stacked list view)           |
| `/waiting`   | Auth      | Waiting for approval screen                   |

### Navigation Changes

- **Bottom nav**: Show an "Admin" item (e.g. shield icon) only for the admin user.
- **Login page**: Add a "Request access" link to `/register`.
- **Auth redirect logic**: After login, if household status is `"waiting"` → redirect to `/waiting`. If `"deactivated"` → show deactivated message.

## Component Structure

### New Pages

- `Register.tsx` — form with name + household name fields, passkey setup.
- `Admin.tsx` — the stacked list admin page with all four sections.
- `Waiting.tsx` — simple centered message + refresh button.

### New API Hooks

- `useAdminHouseholds()` — fetches households with stats.
- `useAdminUsers()` — fetches all users.
- `useAdminSystem()` — fetches system health.
- `useRegister()` — mutation for household registration.
- Admin action mutations: `useApproveHousehold()`, `useRejectHousehold()`, `useDeactivateHousehold()`, `useDeleteHousehold()`, `useResetPasskey()`, `useRemoveMembership()`.

## Error Handling

- Household pending/deactivated: API returns 403 with specific error code. Frontend `apiFetch` wrapper detects this and redirects to `/waiting` or shows deactivated message.
- Pushover failures: logged but never block the main operation (fire-and-forget).
- Delete household: cascading delete of all related data (plans, recipes, lists, staples, etc.).

## Environment Variable Changes

Add to `.env.example`:

```env
# Pushover notifications (optional)
PUSHOVER_USER_KEY=
PUSHOVER_API_TOKEN=
```
