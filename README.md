# Weekboodschappen

Weekly grocery shopping planner for Dutch households. Self-hosted PWA at `boodschappen.mouwen.casa`.

## Ports & Networking

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

### Caddy (reverse proxy)

```
boodschappen.mouwen.casa {
    reverse_proxy app:6883
}
```

Caddy's `reverse_proxy` supports WebSocket upgrades automatically — no extra configuration needed.
