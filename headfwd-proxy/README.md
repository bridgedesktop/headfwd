# HeadFwd Proxy

Cloudflare Workers + Durable Objects reverse tunnel proxy for Headscale.

## Architecture

```
Headscale Sidecar → [WebSocket] → Durable Object ← [HTTP] ← Clients
```

Each Headscale instance gets one Durable Object that holds its persistent tunnel.

## Development

```bash
npm install
npm run dev
```

## Deployment

```bash
# Login
npx wrangler login

# Create KV namespace
npx wrangler kv namespace create REGISTRY
# Update wrangler.jsonc with ID

# Set secret
npx wrangler secret put TUNNEL_SECRET

# Deploy
npm run deploy

# Configure DNS routes in Cloudflare dashboard:
# - headfwd.net/*
# - *.headfwd.net/*
```

## Usage

### Register Headscale

```bash
curl -X POST https://headfwd.net/api/register \
  -H "Content-Type: application/json" \
  -d '{"pubkey": "YOUR_HEADSCALE_PUBKEY"}'
```

Returns:
```json
{
  "fingerprint": "abc123...xyz",
  "tunnelUrl": "wss://abc123.headfwd.net/tunnel?auth=SECRET",
  "publicUrl": "https://abc123.headfwd.net"
}
```

### Start Sidecar

```bash
./headfwd-sidecar --tunnel "wss://abc123.headfwd.net/tunnel?auth=SECRET"
```

### Update Headscale Config

```yaml
server_url: https://abc123.headfwd.net
```

Done! Clients can now connect through the tunnel.

## Protocol

WebSocket messages between sidecar and proxy:

```typescript
// Request (proxy → sidecar)
{
  "type": "request",
  "data": {
    "id": "uuid",
    "method": "GET",
    "url": "/api/v1/key",
    "headers": {...},
    "body": "..."
  }
}

// Response (sidecar → proxy)
{
  "type": "response",
  "data": {
    "id": "uuid",
    "status": 200,
    "headers": {...},
    "body": "..."
  }
}

// Keepalive
{ "type": "ping" }
{ "type": "pong" }
```

## Cost

Free tier: 1M DO requests/month = 100+ Headscale instances  
Paid: $0.15/M DO requests + hibernation savings

## Security

- Tunnel authenticated with secret
- Zero-knowledge (proxy can't decrypt WireGuard traffic)
- Headscale validates all client keys

