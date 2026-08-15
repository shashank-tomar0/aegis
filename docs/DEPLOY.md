# Deploying AEGIS

## Option A — Docker (recommended)

```bash
cd aegis
cp .env.example .env        # optional: set AEGIS_GITHUB_ORG / AEGIS_GITHUB_TOKEN
docker compose up --build -d
# → http://localhost:8787
```

Data persists in the `aegis-data` volume (`/data`: `aegis.db` + `analytics.duckdb`).

### Behind a domain with HTTPS (Caddy / nginx)

Reverse-proxy `aegis:8787`. Example Caddyfile:

```
app.example.com {
    reverse_proxy aegis:8787
    encode gzip
}
```

With HTTPS, the same-origin DuckDB-WASM bundle and the SSE stream work without
special headers (no cross-origin resources anywhere).

## Option B — bare metal / VPS

```bash
npm ci
npm run build                  # dist/
# runtime (Node ≥ 23.4 for node:sqlite):
node node_modules/tsx/dist/cli.mjs server/src/index.ts
# or
npm start
```

Environment:

| Var | Default | Purpose |
|---|---|---|
| `AEGIS_HOST` | `0.0.0.0` | listen host |
| `AEGIS_PORT` | `8787` | listen port |
| `AEGIS_DATA_DIR` | `./data` | persistence dir |
| `AEGIS_GITHUB_ORG` | `vercel` | org scanned by the `github` collector |
| `AEGIS_GITHUB_TOKEN` | — | org secrets / higher rate limits |
| `AEGIS_BASE_URL` | `http://localhost:8787` | CLI default server; frontend override via `VITE_AEGIS_SERVER` |

## Production checklist

- [ ] Set a real `AEGIS_GITHUB_ORG` + token, or instruct users to use `simulated`.
- [ ] Put it behind HTTPS (workers/SSE are cleaner over real TLS).
- [ ] Move the data volume to durable storage and back it up.
- [ ] Rate limits are per-process; scale horizontally behind a shared volume or
      attach a real DB layer when you outgrow one box.

## CLI installation

```bash
npm i -g .          # provides the `aegis` command
aegis login you@example.com
aegis project-create prod
aegis scan github --project <id>
aegis export <id> --out graph.json
```