# Deploy AEGIS to Fly.io (one command)

AEGIS ships a full-stack container (landing + API + SQLite/DuckDB) that runs on a
single Fly.io machine with a persistent volume. Remote builds are used, so you
don't need Docker on your machine.

## 1. Create a Fly account + install flyctl

```bash
# Windows
winget install flyctl
# macOS / Linux
curl -L https://fly.io/install.sh | sh
```

Create a free account at https://fly.io (no card required for the free tier demo).

## 2. Log in once (opens your browser)

```bash
fly auth login
```

## 3. Deploy (everything below is automated)

```bash
npm run deploy:fly                # default name aegis-xxxx, region iad
# or be explicit:
npm run deploy:fly -- --app my-aegis --region fra
```

The script:
1. checks `flyctl` exists and you're logged in
2. patches `fly.toml` with the app name + region
3. creates the app, a 1 GB persistent volume (`aegis_data` → `/data`)
4. sets optional secrets (`AEGIS_GITHUB_TOKEN` / `AEGIS_GITHUB_ORG` if present in env)
5. builds remotely and deploys
6. prints your public URL: `https://<app>.fly.dev`

Optional real-discovery env before deploying:

```bash
export AEGIS_GITHUB_ORG=your-org
export AEGIS_GITHUB_TOKEN=ghp_xxx   # fine-grained PAT, actions:secrets read
```

(If you skip them, the deployed app still works fully via the `simulated`
collector and the PQC/console features — no credentials needed.)

## 4. Managing it

```bash
fly open --app my-aegis    # open the URL
fly logs --app my-aegis    # tail logs
fly scale show --app my-aegis
fly secrets list --app my-aegis
```

- Data lives in the volume: accounts, projects, alerts, DuckDB analytics.
- `auto_stop_machines` puts the app to sleep when idle (free-tier friendly) and
  wakes it on request — first hit after idling takes a few seconds.
- Health checks hit `/api/health` every 10s; rollback is automatic on failure.

## 5. Hardening later

- Point a custom domain: `fly certs add <domain>` after adding the DNS record.
- Enforce a CORS allowlist: redeploy with `CORS_ORIGIN=https://<your-domain>`.
- Back up the volume occasionally: `fly volumes snapshot create <vol-id>`.