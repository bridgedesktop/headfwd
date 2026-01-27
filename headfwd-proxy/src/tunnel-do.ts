// Durable Object: One per Headscale instance
// Holds persistent WebSocket tunnel from Headscale sidecar

import type { Env, TunnelRequest, TunnelResponse, TunnelMessage } from './types';

export class HeadscaleTunnel implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private tunnel: WebSocket | null = null;
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Headscale sidecar connecting
    if (url.pathname === '/tunnel') {
      return this.acceptTunnel(request);
    }
    
    // Client request to forward
    return this.forwardToHeadscale(request);
  }
  
  /**
   * Accept tunnel connection from Headscale sidecar
   */
  private async acceptTunnel(request: Request): Promise<Response> {
    // Verify auth
    const auth = new URL(request.url).searchParams.get('auth');
    if (auth !== this.env.TUNNEL_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Upgrade to WebSocket
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    server.accept();
    this.tunnel = server;
    
    // Handle messages from Headscale
    server.addEventListener('message', (event) => {
      this.handleTunnelMessage(event.data);
    });
    
    server.addEventListener('close', () => {
      this.tunnel = null;
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Tunnel closed'));
      }
      this.pendingRequests.clear();
    });
    
    server.addEventListener('error', (event) => {
      console.error('Tunnel error:', event);
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
  
  /**
   * Forward client request through tunnel to Headscale
   */
  private async forwardToHeadscale(request: Request): Promise<Response> {
    if (!this.tunnel) {
      return new Response('Headscale not connected', { 
        status: 503,
        headers: { 'Retry-After': '30' }
      });
    }
    
    // Serialize request
    const requestId = crypto.randomUUID();
    const tunnelRequest: TunnelRequest = {
      id: requestId,
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body: request.body ? await request.text() : undefined,
    };
    
    // Send through tunnel and wait for response
    return new Promise((resolve, reject) => {
      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 30000);
      
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      
      const message: TunnelMessage = {
        type: 'request',
        data: tunnelRequest,
      };
      
      try {
        this.tunnel!.send(JSON.stringify(message));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }
  
  /**
   * Handle response from Headscale through tunnel
   */
  private handleTunnelMessage(data: string | ArrayBuffer) {
    try {
      const message: TunnelMessage = JSON.parse(data.toString());
      
      if (message.type === 'response') {
        const response = message.data as TunnelResponse;
        const pending = this.pendingRequests.get(response.id);
        
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);
          
          // Reconstruct HTTP response
          const httpResponse = new Response(response.body, {
            status: response.status,
            headers: response.headers,
          });
          
          pending.resolve(httpResponse);
        }
      } else if (message.type === 'ping') {
        // Respond to keepalive
        this.tunnel?.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('Error handling tunnel message:', error);
    }
  }
}

