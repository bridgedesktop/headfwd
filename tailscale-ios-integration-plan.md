# Tailscale iOS Integration Plan

## Overview

Build an iOS app that embeds tailscaled and connects to a self-hosted Headscale instance via QR code onboarding.

**Goal:** Zero-configuration mesh networking for HeadFwd apps  
**Starting Point:** Stock Tailscale codebase + Headscale instance  
**Core Tech:** Go (tailscaled), Swift (iOS), NetworkExtension framework

---

## Architecture

```
┌─────────────────────────────────────┐
│  iOS App (Swift/SwiftUI)            │
│  ┌───────────────────────────────┐  │
│  │ QR Scanner                    │  │
│  │ - Scan Headscale URL + Key    │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ NetworkExtension VPN          │  │
│  │ - WireGuard tunnel            │  │
│  │ - Tailscaled (Go → C bridge)  │  │
│  └───────────────────────────────┘  │
└─────────────────┬───────────────────┘
                  │ WireGuard
                  ▼
      ┌───────────────────────┐
      │ Headscale Instance    │
      │ - Coordination server │
      │ - DERP relay          │
      │ - Self-hosted         │
      └───────────────────────┘
```

---

## Phase 0: Local Development Setup (Days 1-3)

**Goal:** Build tailscale/tailscaled locally on macOS to understand the codebase

### 0.1 - Clone and Explore (Day 1)

**Prerequisites:**
- macOS with Xcode Command Line Tools
- Go 1.25+ installed
- Git

**Steps:**

```bash
# Clone Tailscale repo
cd ~/repos/tailscale
git status  # You already have this

# Verify Go version
go version  # Should be 1.25+

# Explore the codebase
ls -la cmd/    # Main binaries: tailscale, tailscaled
ls -la ipn/    # "IP Network" - core mesh logic
ls -la wgengine/  # WireGuard engine
ls -la derp/   # DERP relay protocol
```

**Key directories to understand:**

| Directory | Purpose |
|-----------|---------|
| `cmd/tailscale` | CLI tool (user-facing commands) |
| `cmd/tailscaled` | Background daemon (mesh networking) |
| `ipn/` | Inter-Process Networking (state machine) |
| `wgengine/` | WireGuard tunnel management |
| `control/controlclient/` | Control plane client (talks to Tailscale/Headscale) |
| `derp/` | DERP relay protocol (NAT traversal fallback) |
| `net/tstun/` | TUN device for packet routing |

**Tasks:**
- [ ] Verify tailscale repo is checked out
- [ ] Install Go 1.25+
- [ ] Explore key directories
- [ ] Read `cmd/tailscaled/tailscaled.go` (main entry point)
- **Test:** Run `go list ./...` to see all packages

### 0.2 - Build Tailscale CLI Locally (Day 2)

```bash
cd ~/repos/tailscale

# Build tailscale CLI
go build ./cmd/tailscale
./tailscale version

# Build tailscaled daemon
go build ./cmd/tailscaled
./tailscaled --version

# Try running with state directory
mkdir -p /tmp/tailscale-test
sudo ./tailscaled --tun=userspace-networking --state=/tmp/tailscale-test/tailscaled.state
```

**Expected output:**
```
tailscaled v1.x.x
  listening on unix socket...
```

**Tasks:**
- [ ] Build `tailscale` CLI successfully
- [ ] Build `tailscaled` daemon successfully
- [ ] Run tailscaled in userspace mode
- [ ] Understand command-line flags (`--tun`, `--state`, etc.)
- **Test:** `./tailscale status` shows "Logged out"

### 0.3 - Connect to Headscale (Day 3)

**Prerequisites:**
- Running Headscale instance (you mentioned you have this)
- Headscale URL (e.g., `https://headscale.example.com`)

```bash
# Set control URL to your Headscale instance
export TS_LOGIN_SERVER="https://your-headscale.example.com"

# Start tailscaled with custom control server
sudo ./tailscaled --tun=userspace-networking \
  --state=/tmp/tailscale-test/tailscaled.state \
  --socket=/tmp/tailscale-test/tailscaled.sock

# In another terminal, login
./tailscale --socket=/tmp/tailscale-test/tailscaled.sock up \
  --login-server=https://your-headscale.example.com

# Follow the authentication URL
# Should open browser to Headscale auth page
```

**Tasks:**
- [ ] Start tailscaled with custom control server
- [ ] Complete authentication flow
- [ ] Verify connection: `./tailscale status`
- [ ] Ping another node in your mesh (if available)
- **Test:** `./tailscale status` shows "Connected" with Tailscale IP

**Checkpoint:** You now understand how tailscaled works at the CLI level!

---

## Phase 1: iOS Architecture Research (Days 4-6)

**Goal:** Understand how Tailscale iOS app works and what we need to replicate

### 1.1 - Study Tailscale iOS App (Day 4)

Tailscale has an official iOS app, but the GUI code is closed source. However, we know:

1. **It uses NetworkExtension framework** (required for VPN on iOS)
2. **Go code runs via gomobile** (Go → C bridge → Swift)
3. **WireGuard userspace implementation** (no kernel module on iOS)

**Research tasks:**
- [ ] Read Apple's NetworkExtension documentation
- [ ] Study WireGuard-iOS source code (open source reference)
- [ ] Understand VPN app entitlements required
- [ ] Research gomobile for Go → iOS compilation

**Key Apple docs:**
- [NetworkExtension Framework](https://developer.apple.com/documentation/networkextension)
- [NEPacketTunnelProvider](https://developer.apple.com/documentation/networkextension/nepackettunnelprovider)
- [Personal VPN Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_developer_networking_networkextension)

### 1.2 - Explore WireGuard-iOS (Day 5)

WireGuard has an open-source iOS app that's very similar architecturally:

```bash
# Clone WireGuard iOS for reference
cd ~/repos
git clone https://git.zx2c4.com/wireguard-ios
cd wireguard-ios

# Explore structure
ls -la Sources/
# - WireGuardApp/         (main app UI)
# - WireGuardNetworkExtension/  (VPN tunnel provider)
# - WireGuardKit/         (Go wrapper via gomobile)
```

**Key learnings:**
- How they bridge Go code to Swift
- How NetworkExtension provider works
- How they handle VPN configuration
- How they manage tunnel lifecycle

**Tasks:**
- [ ] Clone and explore wireguard-ios
- [ ] Read `NEPacketTunnelProvider` implementation
- [ ] Understand how they call Go code from Swift
- [ ] Note build configuration for NetworkExtension targets
- **Reference:** This is your blueprint for integrating tailscaled

### 1.3 - Plan iOS App Structure (Day 6)

**Proposed structure:**

```
HeadFwdApp/
├── HeadFwdApp/                   # Main iOS app
│   ├── App.swift                 # App entry point
│   ├── Views/
│   │   ├── OnboardingView.swift  # QR code scanner
│   │   ├── StatusView.swift      # Connection status
│   │   └── SettingsView.swift    # Config management
│   ├── Models/
│   │   ├── HeadscaleConfig.swift # Parsed QR data
│   │   └── ConnectionState.swift # VPN state
│   └── Services/
│       ├── QRScanner.swift       # QR code parsing
│       └── TunnelManager.swift   # VPN control
│
├── HeadFwdTunnel/                # NetworkExtension target
│   ├── PacketTunnelProvider.swift  # VPN provider
│   └── TailscaleBridge.swift       # Go ↔ Swift bridge
│
├── TailscaleKit/                 # Go wrapper (gomobile)
│   ├── tailscale.go              # Exported Go functions
│   └── bridge.swift              # Swift interface
│
└── Shared/
    └── Config.swift              # Shared config types
```

**Tasks:**
- [ ] Design app architecture
- [ ] Identify required Xcode targets (App + Extension)
- [ ] Plan data flow between components
- [ ] Design QR code format for Headscale connection
- **Deliverable:** Architecture diagram

---

## Phase 2: Go → iOS Compilation (Days 7-10)

**Goal:** Get tailscaled code compiled for iOS using gomobile

### 2.1 - Install gomobile (Day 7)

```bash
# Install gomobile
go install golang.org/x/mobile/cmd/gomobile@latest
go install golang.org/x/mobile/cmd/gobind@latest

# Initialize gomobile with iOS SDKs
gomobile init

# Verify installation
gomobile version
```

**Tasks:**
- [ ] Install gomobile toolchain
- [ ] Initialize with Xcode SDKs
- [ ] Verify iOS targets are available
- **Test:** `gomobile version` succeeds

### 2.2 - Create Minimal Go Bridge (Day 8)

Create a simplified Go package that wraps essential tailscaled functions:

**File: `~/repos/tailscale/mobile/mobile.go`**

```go
package mobile

import (
    "context"
    "fmt"
    "log"
    
    "tailscale.com/ipn"
    "tailscale.com/ipn/ipnlocal"
    "tailscale.com/wgengine"
    "tailscale.com/control/controlclient"
)

// TailscaleBackend wraps the core tailscaled functionality
type TailscaleBackend struct {
    backend *ipnlocal.LocalBackend
    engine  wgengine.Engine
    ctx     context.Context
    cancel  context.CancelFunc
}

// NewBackend creates a new Tailscale backend
func NewBackend(stateDir string, controlURL string) (*TailscaleBackend, error) {
    ctx, cancel := context.WithCancel(context.Background())
    
    // Create WireGuard engine (userspace)
    engine, err := wgengine.NewUserspaceEngine(log.Printf, wgengine.Config{})
    if err != nil {
        cancel()
        return nil, fmt.Errorf("failed to create engine: %w", err)
    }
    
    // Create local backend
    backend, err := ipnlocal.NewLocalBackend(log.Printf, "", engine, 0)
    if err != nil {
        engine.Close()
        cancel()
        return nil, fmt.Errorf("failed to create backend: %w", err)
    }
    
    // Set control server URL (Headscale)
    backend.SetControlServerURL(controlURL)
    
    return &TailscaleBackend{
        backend: backend,
        engine:  engine,
        ctx:     ctx,
        cancel:  cancel,
    }, nil
}

// Start begins the Tailscale connection
func (b *TailscaleBackend) Start() error {
    return b.backend.Start(b.ctx, ipn.Options{})
}

// Login initiates authentication with the control server
func (b *TailscaleBackend) Login() (string, error) {
    // Returns auth URL for user to complete in browser
    // In iOS, we'd show this in a WKWebView
    return b.backend.StartLoginInteractive()
}

// Status returns current connection status
func (b *TailscaleBackend) Status() string {
    status := b.backend.Status()
    return status.BackendState
}

// Close shuts down the backend
func (b *TailscaleBackend) Close() {
    b.backend.Shutdown()
    b.engine.Close()
    b.cancel()
}
```

**Tasks:**
- [ ] Create `mobile/mobile.go` wrapper package
- [ ] Export key functions: `NewBackend`, `Start`, `Login`, `Status`
- [ ] Simplify API for iOS consumption
- [ ] Handle userspace WireGuard engine
- **Test:** `go build ./mobile` succeeds

### 2.3 - Build iOS Framework (Day 9-10)

```bash
cd ~/repos/tailscale

# Build for iOS simulator (x86_64/arm64)
gomobile bind -target=ios -o TailscaleKit.xcframework ./mobile

# This creates TailscaleKit.xcframework with:
# - arm64 (device)
# - x86_64 (simulator)
# - arm64 (simulator, M1 Macs)
```

**Expected output:**
```
TailscaleKit.xcframework/
├── ios-arm64/
│   └── TailscaleKit.framework
├── ios-arm64_x86_64-simulator/
│   └── TailscaleKit.framework
└── Info.plist
```

**Challenges you'll likely face:**

1. **CGO dependencies:** Tailscale uses some C code
2. **Build tags:** Some packages are platform-specific
3. **Size:** Framework will be large (~50MB+)

**Workarounds:**

```bash
# May need to disable certain features for iOS
CGO_ENABLED=1 gomobile bind \
  -target=ios \
  -tags=ios,mobile \
  -ldflags="-s -w" \  # Strip debug info (reduce size)
  -o TailscaleKit.xcframework \
  ./mobile
```

**Tasks:**
- [ ] Build XCFramework for iOS
- [ ] Verify it includes all architectures
- [ ] Test importing into Xcode project
- [ ] Document any build flags needed
- **Deliverable:** Working `TailscaleKit.xcframework`

---

## Phase 3: Basic iOS App (Days 11-15)

**Goal:** Create minimal iOS app that uses TailscaleKit

### 3.1 - Create Xcode Project (Day 11)

```bash
# Create new iOS app
# Open Xcode → New Project → App
# Name: HeadFwdApp
# Language: Swift
# Interface: SwiftUI
# Organization Identifier: com.yourname.headfwd
```

**Project structure:**

1. **Main app target:** `HeadFwdApp`
2. **Network Extension target:** `HeadFwdTunnel` (we'll add this in Phase 4)

**Add TailscaleKit:**

1. Drag `TailscaleKit.xcframework` into Xcode
2. Add to "Frameworks, Libraries, and Embedded Content"
3. Set to "Embed & Sign"

**Tasks:**
- [ ] Create Xcode project
- [ ] Configure bundle identifier
- [ ] Add TailscaleKit.xcframework
- [ ] Verify it builds for simulator
- **Test:** Empty app launches successfully

### 3.2 - Basic UI (Day 12)

**File: `HeadFwdApp/Views/ContentView.swift`**

```swift
import SwiftUI

struct ContentView: View {
    @StateObject private var connectionManager = ConnectionManager()
    
    var body: some View {
        TabView {
            StatusView(connectionManager: connectionManager)
                .tabItem {
                    Label("Status", systemImage: "network")
                }
            
            SettingsView(connectionManager: connectionManager)
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
    }
}

struct StatusView: View {
    @ObservedObject var connectionManager: ConnectionManager
    
    var body: some View {
        VStack(spacing: 20) {
            Text("HeadFwd")
                .font(.largeTitle)
                .bold()
            
            ConnectionStatusIndicator(status: connectionManager.status)
            
            if !connectionManager.isConnected {
                Button("Connect to Headscale") {
                    // Will implement QR scanner
                    connectionManager.showOnboarding = true
                }
                .buttonStyle(.borderedProminent)
            } else {
                VStack {
                    Text("Connected")
                        .font(.headline)
                    Text(connectionManager.tailscaleIP ?? "No IP")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Button("Disconnect") {
                    connectionManager.disconnect()
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .sheet(isPresented: $connectionManager.showOnboarding) {
            OnboardingView(connectionManager: connectionManager)
        }
    }
}

struct ConnectionStatusIndicator: View {
    let status: ConnectionStatus
    
    var body: some View {
        HStack {
            Circle()
                .fill(status.color)
                .frame(width: 12, height: 12)
            
            Text(status.text)
                .font(.caption)
        }
    }
}

enum ConnectionStatus {
    case disconnected
    case connecting
    case connected
    case error(String)
    
    var color: Color {
        switch self {
        case .disconnected: return .gray
        case .connecting: return .orange
        case .connected: return .green
        case .error: return .red
        }
    }
    
    var text: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .error(let msg): return "Error: \(msg)"
        }
    }
}
```

**Tasks:**
- [ ] Create basic SwiftUI views
- [ ] Add status indicator
- [ ] Add connect/disconnect buttons
- [ ] Design clean, minimal UI
- **Test:** UI renders correctly in simulator

### 3.3 - Connection Manager (Day 13-14)

**File: `HeadFwdApp/Services/ConnectionManager.swift`**

```swift
import Foundation
import Combine
import TailscaleKit  // Our Go framework

@MainActor
class ConnectionManager: ObservableObject {
    @Published var status: ConnectionStatus = .disconnected
    @Published var showOnboarding = false
    @Published var tailscaleIP: String?
    
    private var backend: TailscaleBackend?
    private var statusTimer: Timer?
    
    var isConnected: Bool {
        if case .connected = status {
            return true
        }
        return false
    }
    
    // Initialize with saved config if available
    init() {
        if let config = loadSavedConfig() {
            // Auto-connect if previously configured
            Task {
                await connect(with: config)
            }
        }
    }
    
    func connect(with config: HeadscaleConfig) async {
        status = .connecting
        
        do {
            // Initialize Tailscale backend
            backend = try TailscaleBackend(
                stateDir: getStateDirectory(),
                controlURL: config.controlURL
            )
            
            try backend?.start()
            
            // Start polling status
            startStatusPolling()
            
            // Save config for future use
            saveConfig(config)
            
            status = .connected
            
        } catch {
            status = .error(error.localizedDescription)
        }
    }
    
    func disconnect() {
        backend?.close()
        backend = nil
        stopStatusPolling()
        status = .disconnected
        tailscaleIP = nil
    }
    
    private func startStatusPolling() {
        statusTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.updateStatus()
            }
        }
    }
    
    private func stopStatusPolling() {
        statusTimer?.invalidate()
        statusTimer = nil
    }
    
    private func updateStatus() {
        guard let backend = backend else { return }
        
        let statusString = backend.status()
        
        // Parse status and extract IP
        // (Simplified - actual implementation would parse JSON)
        if statusString.contains("Running") {
            status = .connected
            // Extract IP from status
            // tailscaleIP = "100.x.x.x"
        }
    }
    
    private func getStateDirectory() -> String {
        let paths = FileManager.default.urls(
            for: .documentDirectory,
            in: .userDomainMask
        )
        return paths[0].appendingPathComponent("tailscale").path
    }
    
    private func loadSavedConfig() -> HeadscaleConfig? {
        // Load from UserDefaults or Keychain
        guard let data = UserDefaults.standard.data(forKey: "headscale_config"),
              let config = try? JSONDecoder().decode(HeadscaleConfig.self, from: data) else {
            return nil
        }
        return config
    }
    
    private func saveConfig(_ config: HeadscaleConfig) {
        if let data = try? JSONEncoder().encode(config) {
            UserDefaults.standard.set(data, forKey: "headscale_config")
        }
    }
}

struct HeadscaleConfig: Codable {
    let controlURL: String
    let authKey: String?  // Optional pre-auth key
    let serverPublicKey: String  // For verification
}
```

**Tasks:**
- [ ] Create ConnectionManager class
- [ ] Bridge Swift ↔ Go (TailscaleKit)
- [ ] Implement connect/disconnect logic
- [ ] Add status polling
- [ ] Handle errors gracefully
- **Test:** Can initialize backend (may not fully connect yet)

### 3.4 - QR Code Scanner (Day 15)

**File: `HeadFwdApp/Views/OnboardingView.swift`**

```swift
import SwiftUI
import AVFoundation

struct OnboardingView: View {
    @ObservedObject var connectionManager: ConnectionManager
    @Environment(\.dismiss) var dismiss
    @State private var showScanner = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                Text("Connect to Headscale")
                    .font(.title)
                    .bold()
                
                Text("Scan the QR code from your Headscale server to connect")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                
                Button {
                    showScanner = true
                } label: {
                    Label("Scan QR Code", systemImage: "qrcode.viewfinder")
                        .font(.headline)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                
                Divider()
                    .padding(.vertical)
                
                Text("Or enter manually:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                // Manual entry form (fallback)
                ManualEntryForm(connectionManager: connectionManager)
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showScanner) {
                QRScannerView { result in
                    handleQRScan(result)
                    showScanner = false
                }
            }
        }
    }
    
    private func handleQRScan(_ result: String) {
        // Parse QR code content
        // Expected format: headscale://control.url?key=pubkey&auth=optional
        guard let config = parseHeadscaleQR(result) else {
            // Show error
            return
        }
        
        Task {
            await connectionManager.connect(with: config)
            dismiss()
        }
    }
    
    private func parseHeadscaleQR(_ qrString: String) -> HeadscaleConfig? {
        // Parse custom URL scheme
        guard let url = URL(string: qrString),
              url.scheme == "headscale" else {
            return nil
        }
        
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let controlURL = "https://\(url.host ?? "")"
        
        let pubKey = components?.queryItems?.first(where: { $0.name == "key" })?.value
        let authKey = components?.queryItems?.first(where: { $0.name == "auth" })?.value
        
        guard let serverKey = pubKey else {
            return nil
        }
        
        return HeadscaleConfig(
            controlURL: controlURL,
            authKey: authKey,
            serverPublicKey: serverKey
        )
    }
}

struct QRScannerView: View {
    let onScan: (String) -> Void
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        ZStack {
            QRScanner(onScan: onScan)
            
            VStack {
                HStack {
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title)
                            .foregroundColor(.white)
                    }
                    .padding()
                }
                Spacer()
            }
        }
    }
}

// AVFoundation-based QR scanner
struct QRScanner: UIViewControllerRepresentable {
    let onScan: (String) -> Void
    
    func makeUIViewController(context: Context) -> QRScannerViewController {
        let vc = QRScannerViewController()
        vc.onScan = onScan
        return vc
    }
    
    func updateUIViewController(_ uiViewController: QRScannerViewController, context: Context) {}
}

class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((String) -> Void)?
    private var captureSession: AVCaptureSession!
    private var previewLayer: AVCaptureVideoPreviewLayer!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupCamera()
    }
    
    private func setupCamera() {
        captureSession = AVCaptureSession()
        
        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video),
              let videoInput = try? AVCaptureDeviceInput(device: videoCaptureDevice) else {
            return
        }
        
        if captureSession.canAddInput(videoInput) {
            captureSession.addInput(videoInput)
        }
        
        let metadataOutput = AVCaptureMetadataOutput()
        
        if captureSession.canAddOutput(metadataOutput) {
            captureSession.addOutput(metadataOutput)
            
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [.qr]
        }
        
        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.frame = view.layer.bounds
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession.startRunning()
        }
    }
    
    func metadataOutput(_ output: AVCaptureMetadataOutput, 
                       didOutput metadataObjects: [AVMetadataObject], 
                       from connection: AVCaptureConnection) {
        
        guard let metadataObject = metadataObjects.first,
              let readableObject = metadataObject as? AVMetadataMachineReadableCodeObject,
              let stringValue = readableObject.stringValue else {
            return
        }
        
        AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
        captureSession.stopRunning()
        onScan?(stringValue)
    }
}
```

**QR Code Format Proposal:**

```
headscale://headscale.example.com?key=<server-pubkey-fingerprint>&auth=<optional-preauth-key>
```

**Tasks:**
- [ ] Implement QR scanner using AVFoundation
- [ ] Design QR code URL format
- [ ] Parse scanned data into HeadscaleConfig
- [ ] Add manual entry fallback
- [ ] Request camera permissions
- **Test:** Scan test QR code, verify parsing

---

## Phase 4: NetworkExtension VPN (Days 16-20)

**Goal:** Move Tailscale to proper VPN extension (required for background operation)

### 4.1 - Add Network Extension Target (Day 16)

**In Xcode:**

1. File → New → Target
2. Choose "Network Extension"
3. Name: `HeadFwdTunnel`
4. Provider Type: Packet Tunnel

**This creates:**
```
HeadFwdTunnel/
└── PacketTunnelProvider.swift  # VPN entry point
```

**Add capabilities:**

1. Select HeadFwdTunnel target
2. Signing & Capabilities
3. Add "Network Extensions" capability
4. Add "Personal VPN" capability

**Entitlements required:**

```xml
<!-- HeadFwdTunnel.entitlements -->
<key>com.apple.developer.networking.networkextension</key>
<array>
    <string>packet-tunnel-provider</string>
</array>
<key>com.apple.security.application-groups</key>
<array>
    <string>group.com.yourname.headfwd</string>
</array>
```

**Tasks:**
- [ ] Add Network Extension target
- [ ] Configure capabilities
- [ ] Add app group for sharing data
- [ ] Link TailscaleKit framework
- **Test:** Extension target builds

### 4.2 - Implement PacketTunnelProvider (Day 17-18)

**File: `HeadFwdTunnel/PacketTunnelProvider.swift`**

```swift
import NetworkExtension
import TailscaleKit

class PacketTunnelProvider: NEPacketTunnelProvider {
    private var backend: TailscaleBackend?
    
    override func startTunnel(options: [String : NSObject]?, 
                            completionHandler: @escaping (Error?) -> Void) {
        
        // Load configuration from options
        guard let config = loadConfig(from: options) else {
            completionHandler(NSError(domain: "HeadFwd", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Missing configuration"
            ]))
            return
        }
        
        // Initialize Tailscale backend
        do {
            backend = try TailscaleBackend(
                stateDir: getSharedStateDirectory(),
                controlURL: config.controlURL
            )
            
            // Start the engine
            try backend?.start()
            
            // Configure network settings
            let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
            
            // IPv4 settings
            let ipv4Settings = NEIPv4Settings(
                addresses: ["100.64.0.1"],  // Tailscale IP range
                subnetMasks: ["255.192.0.0"]
            )
            ipv4Settings.includedRoutes = [NEIPv4Route.default()]
            settings.ipv4Settings = ipv4Settings
            
            // DNS settings (optional)
            let dnsSettings = NEDNSSettings(servers: ["100.100.100.100"])  // MagicDNS
            settings.dnsSettings = dnsSettings
            
            // Apply settings
            setTunnelNetworkSettings(settings) { error in
                if let error = error {
                    completionHandler(error)
                    return
                }
                
                // Start packet handling
                self.startPacketHandling()
                completionHandler(nil)
            }
            
        } catch {
            completionHandler(error)
        }
    }
    
    override func stopTunnel(with reason: NEProviderStopReason, 
                            completionHandler: @escaping () -> Void) {
        
        backend?.close()
        backend = nil
        completionHandler()
    }
    
    private func startPacketHandling() {
        // Read packets from iOS network stack
        packetFlow.readPackets { [weak self] packets, protocols in
            guard let self = self else { return }
            
            // Send packets to Tailscale engine
            for (index, packet) in packets.enumerated() {
                let proto = protocols[index]
                self.backend?.handlePacket(packet, protocol: proto)
            }
            
            // Continue reading
            self.startPacketHandling()
        }
        
        // Handle outbound packets from Tailscale
        // (This requires modifying the Go bridge to call back into Swift)
        backend?.setPacketHandler { [weak self] packet in
            // Write packet to iOS network stack
            self?.packetFlow.writePackets([packet], withProtocols: [AF_INET])
        }
    }
    
    private func loadConfig(from options: [String: NSObject]?) -> HeadscaleConfig? {
        // Load from shared app group
        guard let defaults = UserDefaults(suiteName: "group.com.yourname.headfwd"),
              let data = defaults.data(forKey: "headscale_config"),
              let config = try? JSONDecoder().decode(HeadscaleConfig.self, from: data) else {
            return nil
        }
        return config
    }
    
    private func getSharedStateDirectory() -> String {
        let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.yourname.headfwd"
        )!
        return containerURL.appendingPathComponent("tailscale").path
    }
}
```

**Challenges:**

1. **Packet handling:** Need to bridge packets between iOS and Go
2. **File descriptors:** Tailscale expects a TUN device file descriptor
3. **Go bridge:** Need to expose packet handling in Go

**Solution: Enhance Go Bridge**

Modify `mobile/mobile.go`:

```go
// PacketHandler is a callback for sending packets to iOS
type PacketHandler interface {
    HandlePacket(packet []byte)
}

var packetHandler PacketHandler

// SetPacketHandler sets the callback for outbound packets
func SetPacketHandler(handler PacketHandler) {
    packetHandler = handler
}

// HandleInboundPacket sends a packet from iOS into the Tailscale engine
func (b *TailscaleBackend) HandleInboundPacket(packet []byte, protocol int) {
    // Inject into WireGuard engine
    b.engine.InjectInbound(packet, protocol)
}

// Start packet forwarding loop
func (b *TailscaleBackend) StartPacketForwarding() {
    go func() {
        for {
            packet := b.engine.ReadOutbound()
            if packetHandler != nil {
                packetHandler.HandlePacket(packet)
            }
        }
    }()
}
```

**Tasks:**
- [ ] Implement PacketTunnelProvider
- [ ] Configure tunnel network settings
- [ ] Handle packet flow (iOS ↔ Go)
- [ ] Enhance Go bridge for packet handling
- [ ] Test basic tunnel establishment
- **Test:** VPN shows "Connected" in iOS Settings

### 4.3 - Connect App to Extension (Day 19)

**File: `HeadFwdApp/Services/TunnelManager.swift`**

```swift
import NetworkExtension

@MainActor
class TunnelManager: ObservableObject {
    @Published var status: NEVPNStatus = .disconnected
    private var manager: NETunnelProviderManager?
    
    init() {
        loadManager()
        observeStatus()
    }
    
    private func loadManager() {
        Task {
            do {
                let managers = try await NETunnelProviderManager.loadAllFromPreferences()
                
                if let existing = managers.first {
                    self.manager = existing
                } else {
                    // Create new manager
                    let manager = NETunnelProviderManager()
                    
                    let proto = NETunnelProviderProtocol()
                    proto.providerBundleIdentifier = "com.yourname.headfwd.HeadFwdTunnel"
                    proto.serverAddress = "HeadFwd"
                    
                    manager.protocolConfiguration = proto
                    manager.localizedDescription = "HeadFwd VPN"
                    manager.isEnabled = true
                    
                    try await manager.saveToPreferences()
                    try await manager.loadFromPreferences()
                    
                    self.manager = manager
                }
                
                self.status = manager?.connection.status ?? .disconnected
                
            } catch {
                print("Failed to load manager: \(error)")
            }
        }
    }
    
    func connect(with config: HeadscaleConfig) {
        // Save config to shared location
        saveConfigToShared(config)
        
        do {
            try manager?.connection.startVPNTunnel()
        } catch {
            print("Failed to start tunnel: \(error)")
        }
    }
    
    func disconnect() {
        manager?.connection.stopVPNTunnel()
    }
    
    private func observeStatus() {
        NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: manager?.connection,
            queue: .main
        ) { [weak self] _ in
            self?.status = self?.manager?.connection.status ?? .disconnected
        }
    }
    
    private func saveConfigToShared(_ config: HeadscaleConfig) {
        let defaults = UserDefaults(suiteName: "group.com.yourname.headfwd")
        if let data = try? JSONEncoder().encode(config) {
            defaults?.set(data, forKey: "headscale_config")
        }
    }
}
```

**Update ConnectionManager to use TunnelManager:**

```swift
@MainActor
class ConnectionManager: ObservableObject {
    private let tunnelManager = TunnelManager()
    
    @Published var status: ConnectionStatus {
        didSet {
            // React to tunnel status
        }
    }
    
    init() {
        // Observe tunnel status
        tunnelManager.$status
            .map { vpnStatus -> ConnectionStatus in
                switch vpnStatus {
                case .disconnected: return .disconnected
                case .connecting, .reasserting: return .connecting
                case .connected: return .connected
                case .disconnecting: return .disconnected
                case .invalid: return .error("Invalid configuration")
                @unknown default: return .disconnected
                }
            }
            .assign(to: &$status)
    }
    
    func connect(with config: HeadscaleConfig) async {
        tunnelManager.connect(with: config)
    }
    
    func disconnect() {
        tunnelManager.disconnect()
    }
}
```

**Tasks:**
- [ ] Create TunnelManager for VPN control
- [ ] Save config to shared app group
- [ ] Start/stop tunnel from main app
- [ ] Observe VPN status changes
- [ ] Update UI to reflect tunnel state
- **Test:** Connect from app, verify VPN activates

### 4.4 - Debug and Test (Day 20)

**Common issues:**

1. **Entitlements:** Make sure both targets have proper capabilities
2. **App Group:** Both app and extension must use same group ID
3. **Bundle ID:** Extension must be app.HeadFwdTunnel
4. **Provisioning:** Need proper development/distribution profiles

**Debugging VPN extension:**

```bash
# View extension logs
log stream --predicate 'process CONTAINS "HeadFwdTunnel"' --level debug

# Or in Console.app, filter by HeadFwdTunnel
```

**Test checklist:**
- [ ] VPN appears in iOS Settings → VPN & Device Management
- [ ] Can activate VPN from app
- [ ] Packets flow through tunnel
- [ ] Can ping other nodes on mesh
- [ ] VPN survives app backgrounding
- [ ] VPN reconnects after network change
- **Deliverable:** Working VPN connection

---

## Phase 5: Headscale Integration (Days 21-23)

**Goal:** Generate QR codes from Headscale and complete auth flow

### 5.1 - Headscale QR Code Generation (Day 21)

On your Headscale server, create a script to generate connection QR codes:

**File: `headscale-qr.sh`**

```bash
#!/bin/bash

# Get Headscale server URL
HEADSCALE_URL="${HEADSCALE_URL:-https://headscale.example.com}"

# Get server public key fingerprint
# (This depends on your Headscale setup)
SERVER_KEY=$(headscale debug dumpconfig | grep public_key | awk '{print $2}')

# Generate pre-auth key (optional, for zero-touch onboarding)
PREAUTH_KEY=$(headscale preauthkeys create --user default --reusable --expiration 24h)

# Create connection URL
CONNECTION_URL="headscale://${HEADSCALE_URL#https://}?key=${SERVER_KEY}&auth=${PREAUTH_KEY}"

echo "Connection URL: $CONNECTION_URL"

# Generate QR code (requires qrencode)
qrencode -t UTF8 "$CONNECTION_URL"

# Or save as image
qrencode -o headscale-connect.png "$CONNECTION_URL"
echo "QR code saved to headscale-connect.png"
```

**Tasks:**
- [ ] Create QR generation script
- [ ] Extract Headscale public key
- [ ] Generate pre-auth keys
- [ ] Create QR code image
- **Deliverable:** Scannable QR code

### 5.2 - Complete Auth Flow (Day 22)

**Enhanced login flow:**

1. **Scan QR code** → Get control URL + auth key
2. **Start VPN** → Connect to Headscale
3. **Auto-authenticate** → Use pre-auth key (if provided)
4. **Or manual auth** → Show web view for interactive login

**Update ConnectionManager:**

```swift
func connect(with config: HeadscaleConfig) async {
    if let authKey = config.authKey {
        // Use pre-auth key (zero-touch)
        await authenticateWithKey(authKey)
    } else {
        // Interactive auth (show web view)
        await authenticateInteractive()
    }
    
    tunnelManager.connect(with: config)
}

private func authenticateWithKey(_ key: String) async {
    // Pass auth key to tunnel extension
    // Extension will use it during registration
}

private func authenticateInteractive() async {
    // Get auth URL from backend
    guard let authURL = await backend?.getAuthURL() else {
        return
    }
    
    // Show web view (WKWebView)
    await showAuthWebView(url: authURL)
}
```

**Add web view for interactive auth:**

```swift
import WebKit

struct AuthWebView: UIViewRepresentable {
    let url: URL
    let onComplete: () -> Void
    
    func makeUIViewController(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }
    
    func updateUIViewController(_ uiViewController: WKWebView, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(onComplete: onComplete)
    }
    
    class Coordinator: NSObject, WKNavigationDelegate {
        let onComplete: () -> Void
        
        init(onComplete: @escaping () -> Void) {
            self.onComplete = onComplete
        }
        
        func webView(_ webView: WKWebView, 
                    decidePolicyFor navigationAction: WKNavigationAction,
                    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            
            // Check if auth completed (redirect to success URL)
            if let url = navigationAction.request.url,
               url.absoluteString.contains("auth-success") {
                onComplete()
                decisionHandler(.cancel)
                return
            }
            
            decisionHandler(.allow)
        }
    }
}
```

**Tasks:**
- [ ] Implement pre-auth key flow
- [ ] Add interactive auth web view
- [ ] Handle auth callbacks
- [ ] Store successful auth state
- **Test:** Complete full auth flow

### 5.3 - End-to-End Testing (Day 23)

**Full integration test:**

1. Start with fresh iOS device/simulator
2. Have Headscale server running with DERP
3. Generate QR code from Headscale
4. Scan QR in iOS app
5. Verify VPN connects
6. Check Headscale: `headscale nodes list`
7. Ping iOS device from another node
8. Verify traffic flows over mesh

**Test scenarios:**
- [ ] Fresh device onboarding
- [ ] Network changes (WiFi ↔ cellular)
- [ ] App backgrounding/foregrounding
- [ ] VPN reconnection after disconnect
- [ ] Multiple devices on same mesh
- **Deliverable:** Fully working mesh network

---

## Phase 6: Polish & Production (Days 24-28)

### 6.1 - Error Handling & UX (Day 24-25)

**Improve error messages:**

```swift
enum ConnectionError: LocalizedError {
    case invalidQRCode
    case networkUnreachable
    case authenticationFailed
    case headscaleUnreachable
    
    var errorDescription: String? {
        switch self {
        case .invalidQRCode:
            return "The QR code format is invalid. Please scan a valid Headscale connection QR code."
        case .networkUnreachable:
            return "Unable to reach the network. Check your internet connection."
        case .authenticationFailed:
            return "Authentication failed. Please try again or contact your administrator."
        case .headscaleUnreachable:
            return "Cannot connect to Headscale server. Verify the server is running."
        }
    }
}
```

**Add loading states:**

```swift
struct LoadingView: View {
    let message: String
    
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            
            Text(message)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(40)
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(16)
    }
}
```

**Tasks:**
- [ ] Add comprehensive error handling
- [ ] Show helpful error messages
- [ ] Add loading indicators
- [ ] Handle edge cases (no camera, etc.)
- [ ] Add retry logic

### 6.2 - Settings & Configuration (Day 26)

**Add settings screen:**

```swift
struct SettingsView: View {
    @ObservedObject var connectionManager: ConnectionManager
    @State private var showResetConfirmation = false
    
    var body: some View {
        Form {
            Section("Connection") {
                LabeledContent("Status", value: connectionManager.status.text)
                
                if let ip = connectionManager.tailscaleIP {
                    LabeledContent("IP Address", value: ip)
                }
                
                if let server = connectionManager.headscaleURL {
                    LabeledContent("Server", value: server)
                }
            }
            
            Section("Advanced") {
                Toggle("Auto-connect on launch", isOn: $connectionManager.autoConnect)
                
                Toggle("Use DERP relay", isOn: $connectionManager.useDERP)
                
                Button("View Logs") {
                    // Show logs view
                }
            }
            
            Section("Danger Zone") {
                Button("Reset Configuration", role: .destructive) {
                    showResetConfirmation = true
                }
            }
        }
        .navigationTitle("Settings")
        .confirmationDialog(
            "Reset Configuration?",
            isPresented: $showResetConfirmation,
            titleVisibility: .visible
        ) {
            Button("Reset", role: .destructive) {
                connectionManager.reset()
            }
        }
    }
}
```

**Tasks:**
- [ ] Add settings screen
- [ ] Configuration options (auto-connect, DERP, etc.)
- [ ] Debug logs viewer
- [ ] Reset/reconfigure option
- [ ] About screen

### 6.3 - Performance & Battery (Day 27)

**Optimize for iOS:**

1. **Reduce polling frequency** when app is backgrounded
2. **Use efficient serialization** for state persistence
3. **Minimize wake-ups** (use system wake logic)
4. **Profile with Instruments** (CPU, Network, Energy)

**Go bridge optimizations:**

```go
// In mobile/mobile.go

// Reduce logging in production
func (b *TailscaleBackend) SetLogLevel(level string) {
    // verbose, normal, quiet
}

// Background mode hint
func (b *TailscaleBackend) EnterBackground() {
    // Reduce polling, pause non-essential tasks
}

func (b *TailscaleBackend) EnterForeground() {
    // Resume normal operation
}
```

**Tasks:**
- [ ] Profile app with Instruments
- [ ] Optimize battery usage
- [ ] Reduce memory footprint
- [ ] Test on real device (not just simulator)
- **Test:** Verify reasonable battery drain

### 6.4 - Documentation (Day 28)

Create comprehensive docs:

**File: `~/repos/headfwd/ios-app-guide.md`**

```markdown
# HeadFwd iOS App Guide

## For Users

### Setup

1. Install HeadFwd app from App Store (or TestFlight)
2. Open app, tap "Connect to Headscale"
3. Scan QR code from your Headscale server
4. Grant VPN permission when prompted
5. Done! You're connected to your mesh network

### Generating QR Code

On your Headscale server:

```bash
./headscale-qr.sh
```

Scan the displayed QR code with your phone.

### Troubleshooting

**App won't connect:**
- Verify Headscale server is reachable
- Check your internet connection
- Try resetting configuration in Settings

**VPN keeps disconnecting:**
- Check Headscale server logs
- Verify DERP server is running
- Try manual reconnect

## For Developers

### Building from Source

...
```

**Tasks:**
- [ ] Write user guide
- [ ] Write developer setup guide
- [ ] Document QR code format
- [ ] Create troubleshooting guide
- [ ] Add screenshots

---

## Summary: Minimal Viable Path

If you want the fastest path to a working prototype (2-3 weeks):

### Week 1: Go + Local Testing
- Days 1-3: Build tailscaled locally, connect to Headscale
- Days 4-5: Create minimal Go bridge (`mobile/mobile.go`)
- Days 6-7: Compile XCFramework with gomobile

### Week 2: iOS App
- Days 8-10: Basic iOS app + UI
- Days 11-13: QR scanner + connection flow
- Day 14: Manual testing (may not have full VPN yet)

### Week 3: VPN Integration
- Days 15-17: NetworkExtension implementation
- Days 18-19: Packet handling (hardest part)
- Days 20-21: End-to-end testing with real Headscale

**Ship:** Working iOS app that creates a Tailscale mesh via your Headscale instance!

---

## Key Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| **Go → iOS compilation** | Use gomobile, create thin bridge API |
| **Packet handling** | Use NetworkExtension, bridge packets via callbacks |
| **File descriptors** | Don't use TUN device, use userspace networking |
| **Size** | ~50MB framework is normal for Go code |
| **Debugging** | Use Console.app, extensive logging |
| **Battery** | Optimize polling, use iOS background modes wisely |

---

## Required Apple Developer Setup

1. **Apple Developer Account** ($99/year)
2. **Capabilities enabled:**
   - Network Extensions
   - Personal VPN
   - App Groups
3. **Provisioning profiles** for both app and extension
4. **Device UDID** registered (for development testing)

---

## Technologies Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| VPN Core | tailscaled (Go) | WireGuard mesh networking |
| Control Server | Headscale | Self-hosted coordination |
| iOS Framework | gomobile | Go → iOS bridge |
| VPN Provider | NetworkExtension | iOS VPN integration |
| UI | SwiftUI | Modern iOS interface |
| QR Scanner | AVFoundation | Camera-based onboarding |
| Auth | WKWebView | Headscale OAuth flow |

---

## Next Immediate Steps

1. ✅ **Verify tailscale builds locally** (you're here now)
2. ⏭️ **Run `./tailscale up --login-server=<your-headscale>`**
3. ⏭️ **Create minimal Go bridge in `mobile/mobile.go`**
4. ⏭️ **Try gomobile bind** (see if it compiles)

**Want me to help with any of these next steps?**

---

## Questions to Answer

Before proceeding, clarify:

1. **Do you have a running Headscale instance?** (URL?)
2. **Do you have an Apple Developer account?** (needed for VPN testing)
3. **Target: Personal use or App Store distribution?**
4. **Timeline: Prototype (2-3 weeks) or production-ready (2-3 months)?**
5. **Other devices on mesh?** (to test connectivity)

Let me know and I'll help you get started! 🚀

