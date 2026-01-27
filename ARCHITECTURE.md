# HeadFwd Architecture

## Core Concept

**Reverse tunnel proxy** - Headscale instances (behind NAT) connect TO the proxy, clients connect THROUGH it.

```
Headscale (home) ──[WebSocket]──> Durable Object <──[HTTP]── Clients
     (initiates)                   (holds tunnel)        (requests)
```

## Why This Design?

Most Headscale instances run at home behind NAT/firewalls. They can't accept inbound connections. Solution: reverse tunnel.

1. Headscale opens persistent WebSocket to proxy
2. Clients make HTTP requests to proxy
3. Proxy forwards through the tunnel
4. Headscale responds back through tunnel

**This is exactly like ngrok, Cloudflare Tunnel, or headfwd-agent.**

## Components

### 1. Headscale Sidecar (Go)
Runs alongside Headscale, initiates tunnel:

```go
ws.Dial("wss://abc123.headfwd.net/tunnel?auth=secret")
for {
    req := ws.ReadMessage()  // Wait for client requests
    resp := forwardToLocalHeadscale(req)
    ws.WriteMessage(resp)
}
```

### 2. Durable Object (Cloudflare)
One per Headscale instance, holds the tunnel:

```typescript
class HeadscaleTunnel {
  private tunnel: WebSocket | null = null;
  
  // Headscale connects here
  acceptTunnel(request) {
    this.tunnel = acceptWebSocket(request);
  }
  
  // Clients request here
  async forwardRequest(request) {
    await this.tunnel.send(serialize(request));
    return await waitForResponse();
  }
}
```

### 3. Worker (Cloudflare Edge)
Routes by fingerprint:

```typescript
const fingerprint = extractFromSubdomain(url);
const doId = env.TUNNEL.idFromName(fingerprint);
return doStub.fetch(request);
```

## Data Flow

```
1. Headscale starts sidecar
   └─> Opens WebSocket to abc123.headfwd.net/tunnel
   └─> DO stores this connection

2. iOS client requests
   └─> GET https://abc123.headfwd.net/api/v1/key
   └─> Worker routes to DO (by fingerprint)
   └─> DO forwards through tunnel WebSocket
   └─> Sidecar receives, forwards to local Headscale
   └─> Response flows back

3. Tunnel stays open (hibernates when idle)
```

## Cost

- **Free tier:** 100+ Headscale instances
- **At scale:** $0.10/user/month (1000 users)
- **Hibernating WebSockets:** Only charged when active

## Security

- Zero-knowledge proxy (encrypted WireGuard traffic)
- Headscale validates all keys
- Sidecar authenticates tunnel with secret
- End-to-end encryption maintained

## vs Alternatives

| Solution | Setup | NAT | Cost |
|----------|-------|-----|------|
| **HeadFwd** | QR code | ✅ Works | Free-$10/mo |
| Port forward | Complex | ❌ Requires config | $0 |
| ngrok | Easy | ✅ Works | $8/mo per instance |
| Cloudflare Tunnel | Medium | ✅ Works | Free (but locked in) |

HeadFwd = ngrok simplicity + self-hosted control + Cloudflare scale

