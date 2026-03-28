# Weekboodschappen

A self-hosted weekly meal planning and grocery shopping app built for Dutch households. Plan your meals, automatically generate shopping lists, and shop together in real-time.

## Features

### Meal Planning
- Plan recipes for each day of the week
- Scrape recipes from any URL (leukerecepten.nl, ah.nl/allerhande, etc.)
- AI-powered recipe suggestions based on current supermarket discounts
- Save and manage your recipe collection with tags and cooking history

### Grocery Lists
- Automatic list generation from your weekly meal plan
- Items grouped and sorted by supermarket category (customizable per store)
- Add staple items that recur every week (milk, bread, etc.)
- Manual items for one-off purchases

### Shopping Mode
- Real-time sync between household members — check off items from any device
- Items matched against current Albert Heijn and Jumbo discount offers
- Optimized for mobile with a swipe-friendly interface

### Household Management
- Invite household members via shareable links
- Passkey authentication (no passwords)
- Admin panel for the app owner to approve new households, manage users, and monitor system health
- Pushover notifications for admin alerts (new household requests, system issues)

### Technical
- Progressive Web App with offline support
- SQLite database (single file, easy backups)
- AI-powered ingredient categorization via Claude
- Daily automatic discount refresh from Albert Heijn and Jumbo

## Self-hosting

### Ports & Networking

The app runs on a single port (default `6883`). WebSocket (Socket.IO) traffic for real-time shopping sync uses the same port — no additional ports need to be opened.

| Service          | Port | Protocol |
|------------------|------|----------|
| HTTP + WebSocket | 6883 | TCP      |

### Router / Firewall

Only port **443** (HTTPS) needs to be open on your router if Caddy handles TLS termination. Caddy automatically proxies WebSocket upgrade requests to the app.

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

#### Environment variables

| Variable | Required | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | Random secret for session signing (min 32 chars) |
| `APP_URL` | Yes | Public URL of your instance |
| `PASSKEY_RP_ID` | Yes | Domain name for WebAuthn (e.g. `your-domain.com`) |
| `TRUSTED_ORIGINS` | Yes | Comma-separated allowed origins for CORS |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI features |
| `PUSHOVER_USER_KEY` | No | Pushover user key for admin notifications |
| `PUSHOVER_API_TOKEN` | No | Pushover app token for admin notifications |

#### First-time setup

1. Start the container
2. Visit your URL — you'll be redirected to the setup page
3. Enter your name and household name
4. Save the recovery code shown (it's only displayed once)
5. Set up a passkey for passwordless login

## Development

```bash
pnpm install
pnpm run dev        # starts server + client
pnpm run test       # runs all tests
pnpm run build      # production build
```

## Tech Stack

- **Frontend**: React 19, React Router, React Query, Tailwind CSS, Vite, Socket.IO
- **Backend**: Express 5, Drizzle ORM, SQLite (WAL mode), Socket.IO, node-cron
- **Auth**: better-auth with passkey/WebAuthn support
- **AI**: Anthropic Claude for ingredient categorization and recipe suggestions
- **Scraping**: Playwright for recipe extraction, albert-heijn-wrapper and jumbo-wrapper for discounts
- **Testing**: Vitest, supertest, React Testing Library
- **CI/CD**: GitHub Actions, Docker, GHCR
