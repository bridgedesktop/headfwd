# HeadFwd

_Decentralized Remote Access Architecture_

Headfwd is a universal access pattern for any self-hosted app.

### A self-owned, peer-to-peer alternative to cloud-based remote control

Modern “remote access” systems rely on centralized control planes that hold user identity, routing, and often cryptographic material. This design is convenient, but it introduces both privacy risk and central dependency.

This architecture inverts that model. Every node—laptop, home server, or mobile app—runs within a **Headscale-managed Tailscale mesh**. Coordination is lightweight, self-hosted, and never custodial.

---

## Core Principles

- **User-Owned Keys:**  
  All encryption keys live _only_ on user devices. No control plane ever sees or stores them.  
  Even initial trust can be bootstrapped physically (e.g. scanning a QR code with the Headscale pubkey fingerprint).

- **Minimal Cloud Involvement:**  
  Public servers provide only **routing and connection assistance**:

  - STUN for NAT traversal
  - DERP for relay fallback
  - Optional DNS-style routing via `headfwd.net` (e.g. `<pubkey>.headfwd.net`)

  These servers see no payloads, credentials, or keys—only encrypted transport metadata.

- **End-to-End P2P Traffic:**  
  Once connected, all data flows directly between peers over encrypted WireGuard tunnels orchestrated by Headscale.

---

## Example: Self-Hosted Photo Library (Immich)

1. A user runs an **Immich photo server** on a home or cloud-hosted machine, bundling a self-hosted Headscale instance.
2. Their phone and Apple TV clients join the same mesh using the Headscale pubkey fingerprint (verified via QR scan).
3. Photo uploads, browsing, and streaming all flow through the P2P mesh—fully encrypted, device-to-device.
4. The public internet is involved only for lightweight routing help (STUN/DERP/bootstrap), never for handling media or credentials.

---

## Why This Matters

This model enables **sovereign networking**—a system where devices connect securely and privately without outsourcing identity or data paths.  
It’s remote access without the “remote” cloud.  
Simple, auditable, and owned by the user.

---
