# Weekboodschappen

A self-hosted weekly meal planning and grocery shopping app for Dutch households.

## Features

- Plan meals for the week and auto-generate grocery lists from recipes
- Scrape recipes from any URL and get AI-powered suggestions based on current discounts
- Real-time shopping mode — check off items synced across all household members
- Automatic discount matching from Albert Heijn and Jumbo
- Passkey authentication, household invites, and admin approval for new households
- PWA with offline support

## Installation

### Docker Compose

```yaml
services:
    weekboodschappen:
        image: ghcr.io/dennism1997/weekboodschappen:latest
        restart: unless-stopped
        ports:
            - "6883:6883"
        volumes:
            - app-data:/data
        environment:
            - BETTER_AUTH_SECRET=change-me-to-a-random-secret-minimum-32-chars
            - APP_URL=https://your-domain.com
            - PASSKEY_RP_ID=your-domain.com
            - TRUSTED_ORIGINS=https://your-domain.com
            - ANTHROPIC_API_KEY=your-api-key-here
            # Optional: Pushover notifications for admin alerts
            # - PUSHOVER_USER_KEY=your-user-key
            # - PUSHOVER_API_TOKEN=your-app-token

volumes:
    app-data:
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | Random secret for session signing (min 32 chars) |
| `APP_URL` | Yes | Public URL of your instance |
| `PASSKEY_RP_ID` | Yes | Domain name for WebAuthn (e.g. `your-domain.com`) |
| `TRUSTED_ORIGINS` | Yes | Comma-separated allowed origins for CORS |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI features |
| `PUSHOVER_USER_KEY` | No | Pushover user key for admin notifications |
| `PUSHOVER_API_TOKEN` | No | Pushover app token for admin notifications |

### First-time setup

1. Start the container and visit your URL
2. Enter your name and household name
3. Save the recovery code (only shown once)
4. Set up a passkey for passwordless login

### Networking

The app runs on a single port (default `6883`). HTTP and WebSocket traffic share the same port. Behind a reverse proxy, only port 443 needs to be exposed.

## Development

```bash
pnpm install
pnpm run dev        # starts server + client
pnpm run test       # runs all tests
pnpm run build      # production build
```

## Tech Stack

**Frontend:** React, React Query, Tailwind CSS, Vite | **Backend:** Express, Drizzle ORM, SQLite, Socket.IO | **Auth:** better-auth + passkeys | **AI:** Claude (Anthropic)
