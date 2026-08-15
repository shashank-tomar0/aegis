# AEGIS Architecture

AEGIS is a full-stack, local-first attack-surface intelligence product for agentic AI
systems. The web UI is its showcase surface; the API + collectors are its substance.

## Runtime topology

```
┌─────────────────────────── Browser (React SPA) ───────────────────────────┐
│  Landing  /            Console /console                                    │
│  hero live graph        canvas graph · blast radius · centrality · crypto  │
│  PQC sandbox            Discover panel (accounts · projects · collectors) │
│  telemetry strip        browser DuckDB-WASM analytics (same-origin)        │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  fetch / EventSource / Workers (all same-origin)
┌───────────────▼────────────────────────────────────────────────────────────┐
│  Fastify server  (single process, port 8787)                               │
│   · SPA static serving + SPA fallback                                      │
│   · Public API    health · stats · stream(SSE) · pqc/* · certs · demo/*    │
│   · Authed API    auth · projects · api-keys · collectors · query ·        │
│                    sessions · graph-sync · events · threats                │
├────────────────────────────────────────────────────────────────────────────┤
│  Stores                                                                     │
│   · node:sqlite (aegis.db)   users · sessions · api_keys · projects · runs  │
│   · DuckDB (analytics.duckdb)  project graphs (nodes/edges/events) + SQL    │
├────────────────────────────────────────────────────────────────────────────┤
│  Collectors (real-world discovery, run server-side)                        │
│   · process   tasklist / ps  → live OS processes = nodes                   │
│   · docker    docker ps + networks → containers + topology edges           │
│   · github    api.github.com org → repos · workflows · secrets · members   │
│   · simulated clearly-badged demo enterprise (zero credentials)            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Auth model

- **Passwords**: scrypt with per-user random salt (`salt:hash`), Node built-ins only.
- **Sessions**: 32-byte random token, SHA-256 stored, HTTP-only `SameSite=Lax` cookie,
  30-day expiry; the same token works as a `Bearer` for the CLI.
- **API keys**: `aeg_` prefix + 40 hex chars; only a SHA-256 hash is stored; revocable;
  `last_used` tracked. Keys authenticate the same authed routes as sessions.
- **Protected vs public**: only demo-facing endpoints stay public (health, stats,
  SSE stream, the PQC playground, `/api/demo/duckdb-version` fixed query); everything
  else returns 401 without credentials.

## Data flow for discovery

```
Collector run (POST /api/collectors/run)
   │  real source (OS / Docker / GitHub) or SIMULATED badged dataset
   ▼
normalized nodes/edges (stable ids like github:repo:org/repo)
   ▼
store.upsertGraph(projectSessionId, …)   ── DuckDB (id, session_id) PK
   ▼
GET /api/projects/:id/graph  → console "LOAD GRAPH" → canvas
```

## Real crypto

`@noble/post-quantum` implements the NIST-selected ML-KEM / ML-DSA / SLH-DSA
families. Every key, signature, and KEM shared secret on the landing sandbox and
in the console's PQC playground is computed by the real algorithms over HTTP.

## CLI

`scripts/aegis.mjs` (zero dependencies, `npm i -g .` exposes `aegis`):
register/login → project-create → scan → export; keys management for CI.

## Security notes / known limits

- `analytics.duckdb` + `aegis.db` live in `AEGIS_DATA_DIR`; containerized via
  `docker-compose` with a named volume.
- Collector processing is bounded (≤120 processes, ≤60 repos, ≤20 workflows/repo)
  and rate-limited at the HTTP layer (200 req/min).
- DuckDB-WASM analytics use a same-origin single-threaded bundle (no CDN workers).