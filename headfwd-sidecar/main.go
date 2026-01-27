package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
)

// Configuration
var (
	tunnelURL      = flag.String("tunnel", "", "Tunnel WebSocket URL (wss://abc123.headfwd.net/tunnel?auth=secret)")
	headscaleURL   = flag.String("headscale", "http://localhost:8080", "Local Headscale URL")
	reconnectDelay = flag.Duration("reconnect", 5*time.Second, "Reconnect delay")
)

// TunnelMessage matches proxy protocol
type TunnelMessage struct {
	Type string          `json:"type"` // "request", "response", "ping", "pong"
	Data json.RawMessage `json:"data"`
}

type TunnelRequest struct {
	ID      string            `json:"id"`
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    *string           `json:"body,omitempty"`
}

type TunnelResponse struct {
	ID      string            `json:"id"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    *string           `json:"body,omitempty"`
}

func main() {
	flag.Parse()

	if *tunnelURL == "" {
		log.Fatal("--tunnel is required")
	}

	log.Printf("HeadFwd Sidecar starting...")
	log.Printf("Tunnel: %s", *tunnelURL)
	log.Printf("Headscale: %s", *headscaleURL)

	for {
		if err := runTunnel(); err != nil {
			log.Printf("Tunnel error: %v", err)
			log.Printf("Reconnecting in %v...", *reconnectDelay)
			time.Sleep(*reconnectDelay)
		}
	}
}

func runTunnel() error {
	// Connect to proxy
	log.Printf("Connecting to tunnel...")
	conn, _, err := websocket.DefaultDialer.Dial(*tunnelURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	log.Printf("✓ Tunnel connected")

	// Keepalive
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			msg := TunnelMessage{Type: "ping"}
			if err := conn.WriteJSON(msg); err != nil {
				return
			}
		}
	}()

	// Handle messages
	for {
		var msg TunnelMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return fmt.Errorf("read: %w", err)
		}

		switch msg.Type {
		case "request":
			go handleRequest(conn, msg.Data)
		case "pong":
			// Keepalive response
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

func handleRequest(conn *websocket.Conn, data json.RawMessage) {
	var req TunnelRequest
	if err := json.Unmarshal(data, &req); err != nil {
		log.Printf("Error unmarshaling request: %v", err)
		return
	}

	log.Printf("%s %s", req.Method, req.URL)

	// Forward to local Headscale
	resp, err := forwardToHeadscale(req)
	if err != nil {
		log.Printf("Error forwarding: %v", err)
		// Send error response
		resp = &TunnelResponse{
			ID:     req.ID,
			Status: 502,
			Headers: map[string]string{
				"Content-Type": "text/plain",
			},
			Body: stringPtr("Bad Gateway"),
		}
	}

	// Send response back through tunnel
	msg := TunnelMessage{
		Type: "response",
		Data: mustMarshal(resp),
	}

	if err := conn.WriteJSON(msg); err != nil {
		log.Printf("Error writing response: %v", err)
	}
}

func forwardToHeadscale(req TunnelRequest) (*TunnelResponse, error) {
	// Build HTTP request to local Headscale
	// Extract path from full URL
	reqURL := req.URL
	if len(reqURL) > 0 && reqURL[0] != '/' {
		// Parse full URL to get path
		u, err := url.Parse(reqURL)
		if err == nil {
			reqURL = u.Path
			if u.RawQuery != "" {
				reqURL += "?" + u.RawQuery
			}
		}
	}
	
	var body io.Reader
	if req.Body != nil {
		body = stringReader(*req.Body)
	}

	httpReq, err := http.NewRequest(req.Method, *headscaleURL+reqURL, body)
	if err != nil {
		return nil, err
	}

	// Copy headers
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	// Execute request
	client := &http.Client{Timeout: 30 * time.Second}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, err
	}

	// Build response
	headers := make(map[string]string)
	for k, v := range httpResp.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	return &TunnelResponse{
		ID:      req.ID,
		Status:  httpResp.StatusCode,
		Headers: headers,
		Body:    stringPtr(string(respBody)),
	}, nil
}

func stringPtr(s string) *string { return &s }
func stringReader(s string) io.Reader {
	return bytes.NewBufferString(s)
}
func mustMarshal(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

