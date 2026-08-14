# AEGIS — Agentic Attack Surface + PQC Crypto-Agility

Zero-slop attack surface intelligence for agentic AI systems. Map agents, tools, and data flows, compute real blast radius, and manage post-quantum cryptographic migration — all with real algorithms, in the browser.

## Core Capabilities

### Graph Engine (`src/engine/graph.ts`)
Real algorithms, no simulation fakes:
- **Blast Radius** — max-flow/min-cut (Edmonds-Karp), risk propagation with hop decay, time-to-compromise, critical path enumeration
- **Centrality** — Brandes betweenness centrality (O(VE))
- **Force Layout** — Fruchterman-Reingold with clamping, quarantine pinning
- **Crypto Profiles** — per-node algorithm, key size, quantum resistance, NIST level, migration target/priority, cert metadata
- **History** — snapshot-based undo stack

### Analytics Engine (`src/engine/analytics.ts`)
Real DuckDB-WASM in the browser:
- Nodes/edges/events tables with indexes
- Prepared queries: top risk, crypto inventory, migration plan, recursive CTE attack paths, blast radius summary, centrality outliers, severity distribution
- Append-only event buffer with batched flush
- Arrow IPC + Parquet export
- Custom SQL in the UI

### ZK Proof Engine (`src/engine/zkproof.ts`)
Privacy-preserving threat intel:
- Pedersen-style commitments (WebCrypto SHA-256/HMAC)
- Merkle tree batching with membership proofs
- Nullifier set for double-submission prevention
- Zero-knowledge key rotation proofs

### UI
- Canvas graph rendering (DPR-aware, 60fps, hit-testing, zoom/pan)
- Panels: **Topology** inventory, **Node Details**, **Event Log**, **Analytics** (SQL), **Crypto** (PQC migration queue), **Threats** (ZK intel), **Settings**
- Command palette (Ctrl+K) with fuzzy search
- Full keyboard shortcuts
- Dark terminal aesthetic, JetBrains Mono

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # tsc -b && vite build
npm run preview
```

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

## Architecture

```
src/
├── engine/          # Pure logic (graph, analytics, zkproof, rng)
├── store/           # Zustand state + persistence
├── components/
│   ├── graph/       # Canvas rendering
│   ├── panels/      # Sidebar panels
│   └── ui/          # Command palette
└── types/           # Domain types (branded IDs, enums)
```

The engine layer is fully dependency-free and testable in Node (`npx tsx`).