# AEGIS — Agentic Attack Surface + PQC Crypto-Agility

Zero-slop attack surface intelligence for agentic AI systems. Map agents, tools, and data flows, compute real blast radius, manage post-quantum cryptographic migration, and issue PQC-signed certificates — **full stack**, with real algorithms and real NIST-selected post-quantum crypto.

## Full-Stack Architecture

```
aegis/
├── src/                  # React + Vite frontend
│   ├── engine/           # Browser engines (graph, DuckDB-WASM, ZK)
│   ├── store/            # Zustand state + server actions
│   ├── lib/api.ts        # Typed REST client for the backend
│   └── components/       # Canvas graph + sidebar panels
├── server/               # Fastify backend (Node 20+)
│   ├── src/routes.ts     # REST API
│   ├── src/services/pqc.ts    # Real PQC crypto (@noble/post-quantum)
│   ├── src/db/store.ts   # Server-side DuckDB analytics
│   └── src/index.ts      # Entry — serves API + built SPA
└── shared/types.ts       # API contract shared by client & server
```

## Core Capabilities

### Graph Engine (`src/engine/graph.ts`)
Real algorithms, no simulation fakes:
- **Blast Radius** — max-flow/min-cut (Edmonds-Karp), risk propagation with hop decay, time-to-compromise, critical path enumeration
- **Centrality** — Brandes betweenness centrality (O(VE))
- **Force Layout** — Fruchterman-Reingold with clamping, quarantine pinning
- **Crypto Profiles** — per-node algorithm, key size, quantum resistance, NIST level, migration target/priority, cert metadata
- **History** — snapshot-based undo stack

### Analytics Engine — DuckDB everywhere
- **Browser** (`src/engine/analytics.ts`): DuckDB-WASM with nodes/edges/events tables, prepared queries, recursive-CTE attack paths, Arrow IPC export
- **Server** (`server/src/db/store.ts`): native DuckDB with session persistence, graph sync, event ingestion, and a SQL query endpoint

### PQC Crypto Service (`server/src/services/pqc.ts`)
Real NIST-selected post-quantum algorithms via `@noble/post-quantum`:
- **ML-KEM-512/768/1024** — keygen + KEM encapsulate/decapsulate (shared secret round-trip)
- **ML-DSA-44/65/87** — keygen + sign/verify
- **SLH-DSA-SHAKE-128F/192F/256F** — stateless hash-based signatures
- **PQC Certificate issuance** — PEM-encoded certs signed with ML-DSA/SLH-DSA

### ZK Proof Engine (`src/engine/zkproof.ts`)
Privacy-preserving threat intel (client-side):
- Pedersen-style commitments (WebCrypto SHA-256/HMAC), Merkle tree batching, nullifier set, zero-knowledge key rotation proofs

### UI
- **Landing page** (`/`) — Instrument Serif display type over a live hero graph running the real engine (force layout, click-for-blast-radius), an embedded PQC terminal driven by the real API, a capability grid of live computations, and an SSE-fed telemetry strip. Ctrl+K command palette on the landing too.
- Canvas graph rendering (DPR-aware, hit-testing, zoom/pan), command palette (Cmd/Ctrl+K), full keyboard shortcuts, dark terminal aesthetic
- Panels: **Topology**, **Node Details**, **Event Log**, **Analytics**, **Crypto**, **Threats**, **Server** (connection status, sessions, PQC playground, remote DuckDB query), **Settings**
- Routing: `/` landing, `/console` app (lazy-loaded) — hash-free via History API

## Quick Start

```bash
# 1. Install (frontend + backend deps)
npm install

# 2a. Full stack in production mode
npm start                # builds frontend, serves SPA + API at http://localhost:8787

# 2b. Or dev mode (hot reload)
npm run dev              # frontend at http://localhost:5174
npm run dev:server       # backend API at http://localhost:8787 (watch mode)
```

The frontend probes `http://localhost:8787` automatically on load (override with `VITE_AEGIS_SERVER`).

## API Surface

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server status + capabilities |
| GET/POST | `/api/pqc/keys` | PQC keypair generation (`algorithm`) |
| POST | `/api/pqc/sign` | ML-DSA/SLH-DSA sign (`message`, `algorithm`) |
| POST | `/api/pqc/capsule` | ML-KEM encapsulate (`publicKeyB64`) |
| POST | `/api/pqc/decapsulate` | ML-KEM decapsulate (shared secret) |
| POST | `/api/certs` | Issue PQC-signed certificate |
| GET/POST | `/api/sessions` | List / create server sessions |
| POST | `/api/graph/sync` | Mirror client graph into server DuckDB |
| POST | `/api/events` | Ingest security events |
| POST | `/api/query` | Execute SQL against server DuckDB |
| GET/POST | `/api/threats` | Threat-intel registry |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Start/stop simulation |
| `F` | Zoom to fit |
| `Z` | Recalculate centrality |
| `B` / `P` / `C` | Blast / path / crypto mode |
| `V` / `H` | Select / pan mode |
| `S` | Step simulation |
| `A` / `T` / `D` / `G` | Add agent / tool / data / gateway |
| `E` | Connect selected nodes |
| `Ctrl+K` | Command palette |
| `Ctrl+S` | Save session |
| `Ctrl+N` | New session |
| `Ctrl+Z` | Undo |
| `Esc` | Deselect |

## Verified End-to-End

- ML-KEM-768 keygen + encapsulate/decapsulate over HTTP → shared secrets match (32 bytes)
- ML-DSA-65 / SLH-DSA sign/verify → `verified: true`
- Cert issuance with ML-DSA-87 → PEM output
- Session create → event ingest → graph sync → DuckDB aggregate query over synced data
