# Caddy Reverse Proxy Configuration

Example Caddyfile entry for proxying `boodschappen.mouwen.casa` to the Weekboodschappen app server.

```caddyfile
boodschappen.mouwen.casa {
    reverse_proxy <app-server-ip>:3001
}
```

This handles:
- Automatic HTTPS via Let's Encrypt
- WebSocket proxying (Socket.IO) — Caddy supports this by default
- HTTP/2
- All API routes (`/api/*`) and static files are served by the Express app
