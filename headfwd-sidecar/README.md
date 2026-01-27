# HeadFwd Sidecar

Runs alongside Headscale to establish reverse tunnel through HeadFwd proxy.

## Usage

```bash
# Build
go build -o headfwd-sidecar

# Run
./headfwd-sidecar \
  --tunnel "wss://abc123...xyz.headfwd.net/tunnel?auth=YOUR_SECRET" \
  --headscale "http://localhost:8080"
```

## Docker Compose

Add to your `docker-compose.yml`:

```yaml
services:
  headscale:
    image: headscale/headscale:latest
    # ... existing config ...
  
  headfwd-sidecar:
    image: headfwd/sidecar:latest
    environment:
      - TUNNEL_URL=wss://abc123.headfwd.net/tunnel?auth=secret
      - HEADSCALE_URL=http://headscale:8080
    depends_on:
      - headscale
```

## How It Works

1. Sidecar opens persistent WebSocket to proxy
2. Proxy forwards client HTTP requests through WebSocket
3. Sidecar forwards to local Headscale
4. Response flows back through tunnel

This allows Headscale behind NAT to be accessible via public URL.

