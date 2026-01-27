# HeadFwd

Zero-knowledge remote access. You own the keys, you own the network.

## What Is This?

HeadFwd lets you access your self-hosted apps from anywhere using Headscale (self-hosted Tailscale), even if your server is behind NAT/firewall.

**Problem:** Headscale at home → can't accept inbound connections. Maintaining DDNS and port forwarding sucks.
**Solution:** Zero-knowledge reverse tunnel (like ngrok, but the proxy can't see your keys or data)

You now have the best of both worlds; a secure, local control plane AND remote access.

## Architecture

```
┌─────────────────┐         Persistent WebSocket            ┌──────────────────┐
│   Headscale     │════════════════════════════════════════>│  Cloudflare      │
│   (at home,     │  1. Tunnel opens on startup             │  Durable Object  │
│    behind NAT)  │                                         │                  │
└─────────────────┘                                         └──────────────────┘
                                                                     ▲
                                                        2. Client    │
                                                           requests  │
                                                                     ▼
                                                            ┌─────────────────┐
                                                            │  Client (iOS)   │
                                                            │  HTTP requests  │
                                                            └─────────────────┘
```

1. Headscale sidecar opens persistent WebSocket to proxy
2. Clients make HTTP requests to `https://<fingerprint>.headfwd.net`
3. Proxy forwards through tunnel to Headscale
4. WireGuard mesh established, then direct P2P

## Components

- **`headfwd-proxy/`** - Cloudflare Workers + Durable Objects proxy
- **`headfwd-sidecar/`** - Go sidecar that runs with Headscale
- **`tailscale-ios-integration-plan.md`** - iOS app integration guide

## Quick Start

### 1. Deploy Proxy (Cloudflare)

```bash
cd headfwd-proxy
npx wrangler login
npx wrangler kv namespace create REGISTRY
# Update wrangler.jsonc with KV ID
npm run deploy
```

### 2. Run Headscale + Sidecar

```bash
cd headfwd
docker compose up -d

# Register with proxy
curl -X POST https://headfwd.net/api/register \
  -H "Content-Type: application/json" \
  -d '{"pubkey": "YOUR_HEADSCALE_PUBKEY"}'

# Returns: { "tunnelUrl": "wss://abc123.headfwd.net/tunnel?auth=secret", ... }

# Start sidecar
cd headfwd-sidecar
go build
./headfwd-sidecar --tunnel "wss://abc123.headfwd.net/tunnel?auth=secret"
```

### 3. Update Headscale Config

```yaml
# headscale/config/config.yaml
server_url: https://abc123...xyz.headfwd.net
```

### 4. Connect Clients

Clients connect to `https://abc123.headfwd.net` instead of direct IP.

## Cost

- **Free tier:** 100+ Headscale instances
- **At scale:** $0.10/user/month (1000 users)
- Hibernating WebSockets = only charged when active

## Security

- Zero-knowledge proxy (sees only encrypted traffic)
- Headscale validates all keys
- End-to-end WireGuard encryption
- Sidecar authenticates with secret

## vs Alternatives

| Solution          | NAT | Setup   | Cost             |
| ----------------- | --- | ------- | ---------------- |
| **HeadFwd**       | ✅  | QR code | Free-$10/mo      |
| Port forward      | ❌  | Complex | $0               |
| ngrok             | ✅  | Easy    | $8/mo each       |
| Cloudflare Tunnel | ✅  | Medium  | Free (locked in) |

## Next Steps

See `tailscale-ios-integration-plan.md` for iOS app development.

## References

- [Headscale](https://headscale.net/)
- [Tailscale](https://tailscale.com/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- Inspired by [kubesail-agent](https://github.com/kubesail/kubesail-agent)
