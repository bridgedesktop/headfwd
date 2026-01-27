/**
 * HeadFwd Proxy - Reverse tunnel for Headscale instances
 *
 * Routes client requests to Headscale instances behind NAT via persistent WebSocket tunnels
 */

import type { Env } from './types';
import { HeadscaleTunnel } from './tunnel-do';

export { HeadscaleTunnel };

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Health check
		if (url.pathname === '/health') {
			return new Response('OK', { status: 200 });
		}

		// Registration endpoint (for Headscale to get tunnel URL)
		if (url.pathname === '/api/register' && request.method === 'POST') {
			return handleRegister(request, env);
		}

		// Extract fingerprint from subdomain
		const fingerprint = extractFingerprint(url.hostname);

		if (!fingerprint) {
			// Landing page
			if (url.hostname === 'headfwd.net' || url.hostname === 'localhost') {
				return new Response(getLandingPage(), {
					headers: { 'Content-Type': 'text/html' },
				});
			}

			return new Response('Invalid subdomain. Expected: <fingerprint>.headfwd.net', {
				status: 400,
			});
		}

		// Route to Durable Object for this Headscale instance
		const doId = env.TUNNELS.idFromName(fingerprint);
		const doStub = env.TUNNELS.get(doId);

		return doStub.fetch(request);
	},
} satisfies ExportedHandler<Env>;

/**
 * Register a new Headscale instance
 */
async function handleRegister(request: Request, env: Env): Promise<Response> {
	try {
		const { pubkey } = (await request.json()) as { pubkey: string };

		if (!pubkey) {
			return new Response(JSON.stringify({ error: 'Missing pubkey' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
		}

		// Compute fingerprint
		const fingerprint = await computeFingerprint(pubkey);

		// Generate tunnel secret
		const secret = generateSecret();

		// Store in KV
		await env.REGISTRY.put(
			`tunnel:${fingerprint}`,
			JSON.stringify({
				fingerprint,
				secret,
				createdAt: Date.now(),
			}),
			{ expirationTtl: 60 * 60 * 24 * 365 } // 1 year
		);

		return new Response(
			JSON.stringify({
				fingerprint,
				tunnelUrl: `wss://${fingerprint}.headfwd.net/tunnel?auth=${secret}`,
				publicUrl: `https://${fingerprint}.headfwd.net`,
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
	}
}

/**
 * Extract fingerprint from subdomain
 */
function extractFingerprint(hostname: string): string | null {
	const match = hostname.match(/^([a-f0-9]{64})\.headfwd\.net$/i);
	return match ? match[1].toLowerCase() : null;
}

/**
 * Compute SHA256 fingerprint from public key
 */
async function computeFingerprint(pubkey: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(pubkey);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate secure random secret
 */
function generateSecret(): string {
	const buffer = new Uint8Array(32);
	crypto.getRandomValues(buffer);
	return Array.from(buffer)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Landing page
 */
function getLandingPage(): string {
	return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>HeadFwd - Decentralized Remote Access</title>
  <style>
    body {
      font-family: -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 20px;
    }
    .container { max-width: 600px; text-align: center; }
    h1 { font-size: 3rem; margin-bottom: 1rem; }
    p { font-size: 1.2rem; line-height: 1.6; opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 HeadFwd</h1>
    <p>Reverse tunnel proxy for self-hosted Headscale instances</p>
    <p>Access your mesh network from anywhere, even behind NAT</p>
  </div>
</body>
</html>
  `.trim();
}
