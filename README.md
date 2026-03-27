# Weekboodschappen

Weekly grocery shopping planner for Dutch households. Self-hosted PWA at `boodschappen.mouwen.casa`.

## Ports & Networking

The app runs on a single port (default `6883`). WebSocket (Socket.IO) traffic for real-time shopping sync uses the same port — no additional ports need to be opened.

| Service | Port | Protocol |
|---------|------|----------|
| HTTP + WebSocket | 6883 | TCP |

### Router / Firewall

Only port **443** (HTTPS) needs to be open on your router if Caddy handles TLS termination. Caddy automatically proxies WebSocket upgrade requests to the app.

### Docker Compose

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "6883:6883"   # HTTP + WebSocket (Socket.IO)
    volumes:
      - app-data:/data
    environment:
      - DATABASE_PATH=/data/weekboodschappen.db
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - PORT=6883
```

### Caddy (reverse proxy)

```
boodschappen.mouwen.casa {
    reverse_proxy app:6883
}
```

Caddy's `reverse_proxy` supports WebSocket upgrades automatically — no extra configuration needed.
