# Asili

_Swahili for "Root"_ - Your personal family genomic risk assistant that never owns your data.

<img src="assets/screenshot.png">

## Overview

Asili is a privacy-first genomic risk analysis platform that processes DNA data entirely on your own hardware. Built on IndexedDB and DuckDB WASM architecture, it ensures your genetic information never leaves your control while providing comprehensive polygenic risk score (PGS) calculations.

## Current Architecture

### Browser-Based SPA (v1.0)

- **Frontend**: Web Components + DuckDB WASM
- **Storage**: IndexedDB for user data, DuckDB for genomic datasets
- **Processing**: Client-side JavaScript with WASM acceleration
- **Data**: Parquet files served via HTTP Range Requests
- **Privacy**: Zero-knowledge - all processing happens locally

### Deployment Options

1. **Static Hosting**: Deploy to any CDN (S3, Netlify, Vercel)
2. **Local Docker**: Single-container deployment for home servers
3. **Development**: Docker Compose with pipeline, CDN, and webapp

## Architectural Evolution Plan

### Phase 1: Mobile Companion Architecture

#### Problem Statement

Mobile devices have limitations that make direct DNA processing impractical:

- **Memory constraints**: Large genomic datasets exceed mobile RAM
- **CPU limitations**: Complex PGS calculations are slow on mobile processors
- **User patience**: Mobile users expect sub-minute interactions
- **Battery drain**: Intensive processing impacts device usability

#### Solution: Desktop-Mobile Bridge

Create a companion mobile app that communicates with a desktop/laptop instance over local WiFi:

```
[Mobile App] <--WiFi--> [Desktop Browser/Container] <--Local--> [Genomic Data]
```

**Key Components:**

1. **Desktop Host**: Runs existing Asili web app or container
2. **Mobile Client**: Native iOS/Android app with simplified UI
3. **Local Network Bridge**: WebSocket/HTTP API for secure communication
4. **Simple Authentication**: QR code pairing + session tokens

**Benefits:**

- Mobile gets responsive UI without heavy processing
- Desktop handles memory-intensive genomic calculations
- Data never leaves local network
- Maintains privacy-first architecture

### Phase 2: Containerized Home Server

#### Single Container Deployment

Enable technical users to run Asili as a 24/7 home server:

```dockerfile
# Unified Asili Container
FROM node:22-alpine
# Includes: Web UI + API + DuckDB + Genomic Pipeline
EXPOSE 8080 8081
CMD ["npm", "start"]
```

**Features:**

- **Web Interface**: Full desktop experience on port 8080
- **Mobile API**: REST/WebSocket endpoints on port 8081
- **Background Processing**: Automatic PGS updates and caching
- **Multi-user**: Family member profiles with separate data isolation
- **Persistent Storage**: Docker volumes for genomic data and user profiles

### Phase 3: Unified Core Library

#### Shared Genomic Engine

Extract common functionality into a canonical library:

```
@asili/core
├── genomic-processor/     # DuckDB + PGS calculations
├── data-pipeline/         # Parquet generation + caching
├── storage-manager/       # IndexedDB + file system abstraction
├── risk-calculator/       # Polygenic risk score algorithms
└── privacy-utils/         # Data anonymization + security
```

**Platform Implementations:**

- **Browser**: Web Components + WASM bindings
- **Mobile**: React Native + native modules
- **Server**: Node.js + native DuckDB
- **Desktop**: Electron wrapper (future)

## Implementation Roadmap

### Phase 1: Mobile Bridge (4-6 weeks)

#### Week 1-2: Desktop API Layer

- [ ] Add WebSocket server to existing web app
- [ ] Create REST API for mobile operations
- [ ] Implement QR code pairing system
- [ ] Add session management and basic auth

#### Week 3-4: Mobile App Foundation

- [ ] React Native app with core navigation
- [ ] QR code scanner for desktop pairing
- [ ] WebSocket client for real-time communication
- [ ] Basic UI for DNA upload and results viewing

#### Week 5-6: Integration & Testing

- [ ] End-to-end DNA processing workflow
- [ ] Error handling and offline scenarios
- [ ] Performance optimization for mobile UI
- [ ] Security audit of local network communication

### Phase 2: Container Deployment (3-4 weeks)

#### Week 1-2: Unified Container

- [ ] Merge web app and pipeline into single container
- [ ] Add multi-user support with data isolation
- [ ] Implement persistent storage with Docker volumes
- [ ] Create mobile API endpoints

#### Week 3-4: Production Features

- [ ] Health checks and monitoring
- [ ] Backup and restore functionality
- [ ] Configuration management
- [ ] Documentation and deployment guides

### Phase 3: Core Library Extraction (6-8 weeks)

#### Week 1-3: Library Architecture

- [ ] Extract genomic processing logic
- [ ] Create platform-agnostic interfaces
- [ ] Implement storage abstraction layer
- [ ] Add comprehensive test suite

#### Week 4-6: Platform Adaptations

- [ ] Browser implementation with existing components
- [ ] Mobile native modules for performance-critical operations
- [ ] Server implementation with Node.js optimizations
- [ ] Cross-platform validation

#### Week 7-8: Integration & Documentation

- [ ] Update all platforms to use shared library
- [ ] Performance benchmarking across platforms
- [ ] API documentation and developer guides
- [ ] Migration tools for existing users

## Technical Specifications

### Mobile App Requirements

- **Platforms**: iOS 14+, Android 8+ (API 26+)
- **Framework**: React Native 0.73+
- **Key Dependencies**:
  - WebSocket client for desktop communication
  - QR code scanner for pairing
  - Secure storage for session tokens
  - File picker for DNA uploads

### Container Requirements

- **Base Image**: `node:22-alpine` (minimal footprint)
- **Memory**: 2GB minimum, 4GB recommended
- **Storage**: 10GB for genomic datasets + user data
- **Network**: Ports 8080 (web), 8081 (mobile API)
- **Architecture**: Multi-arch support (amd64, arm64)

### Core Library Architecture

```typescript
interface GenomicProcessor {
  loadDataset(source: DataSource): Promise<Dataset>;
  calculatePGS(dna: DNAData, traits: TraitConfig[]): Promise<RiskScores>;
  cacheResults(results: RiskScores): Promise<void>;
}

interface StorageManager {
  store(key: string, data: any): Promise<void>;
  retrieve(key: string): Promise<any>;
  clear(): Promise<void>;
}

interface PrivacyManager {
  anonymize(data: DNAData): Promise<AnonymizedData>;
  encrypt(data: any, key: string): Promise<EncryptedData>;
  decrypt(data: EncryptedData, key: string): Promise<any>;
}
```

## Security & Privacy Considerations

### Local Network Security

- **Encryption**: TLS 1.3 for all mobile-desktop communication
- **Authentication**: Time-limited session tokens + device fingerprinting
- **Network Isolation**: Bind to local interfaces only (127.0.0.1, 192.168.x.x)
- **Firewall Rules**: Block external access to API ports

### Data Protection

- **Zero-Knowledge**: No genomic data transmitted outside local network
- **Encryption at Rest**: AES-256 for stored DNA files and results
- **Memory Safety**: Secure cleanup of sensitive data in memory
- **Audit Logging**: Track all data access and processing operations

### Container Security

- **Non-Root User**: Run processes as unprivileged user
- **Read-Only Filesystem**: Immutable container with writable volumes
- **Resource Limits**: CPU and memory constraints to prevent DoS
- **Network Policies**: Restrict outbound connections to genomic data sources only

## Deployment Options

### 1. Static Hosting (Current)

```bash
# Build and deploy to CDN
npm run build
aws s3 sync dist/ s3://your-bucket --delete
```

### 2. Local Development

```bash
# Full stack with pipeline
docker compose up
# Access at http://localhost:4242
```

### 3. Home Server Container

```bash
# Single container deployment
docker run -d \
  --name asili \
  -p 8080:8080 \
  -p 8081:8081 \
  -v asili-data:/app/data \
  asili/server:latest
```

### 4. Mobile + Desktop Bridge

```bash
# Desktop: Start web app with mobile API
npm run dev:mobile-bridge

# Mobile: Install and pair with desktop
# Scan QR code from desktop interface
```

## Contributing

### Development Setup

```bash
# Clone and install dependencies
git clone https://github.com/your-org/asili.git
cd asili
npm install

# Start development environment
docker compose up -d
npm run dev
```

### Project Structure

```
asili/
├── apps/
│   ├── web/              # Browser SPA
│   ├── mobile/           # React Native app (Phase 1)
│   └── server/           # Container deployment (Phase 2)
├── packages/
│   ├── core/             # Shared genomic library (Phase 3)
│   └── pipeline/         # Data processing pipeline
├── data_out/             # Generated genomic datasets
└── cache/                # PGS file cache
```

### Testing Strategy

- **Unit Tests**: Core genomic calculations and data processing
- **Integration Tests**: End-to-end DNA upload and risk calculation
- **Performance Tests**: Memory usage and processing speed benchmarks
- **Security Tests**: Privacy compliance and vulnerability scanning
- **Cross-Platform Tests**: Validation across browser, mobile, and server

## Roadmap & Milestones

### Q1 2024: Mobile Foundation

- ✅ Browser SPA with DuckDB WASM
- 🚧 Mobile companion app
- 🚧 Desktop-mobile bridge API

### Q2 2024: Container Deployment

- 📋 Single container home server
- 📋 Multi-user support
- 📋 24/7 background processing

### Q3 2024: Core Library

- 📋 Unified genomic processing library
- 📋 Cross-platform compatibility
- 📋 Performance optimizations

### Q4 2024: Advanced Features

- 📋 Family sharing and collaboration
- 📋 Advanced risk modeling
- 📋 Integration with health platforms

## License

AGPLv3 License - See [LICENSE](LICENSE) for details.

**Why AGPLv3?**
- Prevents proprietary forks - anyone who modifies Asili must share their changes
- Network copyleft - if you run a modified version as a web service, you must provide source code
- Protects the community - ensures improvements benefit everyone
- Commercial use allowed - you can charge for services, but must keep code open source

**What this means:**
- ✅ Use Asili freely for personal or commercial purposes
- ✅ Modify and improve the code
- ✅ Run it as a service for others
- ❌ Create a proprietary closed-source version
- ❌ Hide your modifications from users

## Privacy Statement

Asili is designed with privacy as the foundational principle:

- **No Data Collection**: We never see, store, or transmit your genomic data
- **Local Processing**: All analysis happens on your own hardware
- **Open Source**: Full transparency in how your data is processed
- **User Control**: You own and control all data and results

Your DNA data is yours alone. Asili simply provides the tools to analyze it privately.
