# PR Preview Environments — Progress Tracker

**Last updated:** 2026-02-20

## Stage Status

| Stage | Status | Notes |
|---|---|---|
| 1A: Deploy core DBs to Fly | Done | Doltgres, Postgres, SpiceDB on multi-container Machine |
| 1B: Add optional services | Pending | Nango, SigNoz, OTEL, Jaeger — not required for core flow |
| 1C: E2E local test | Done | migrations → auth init → project push → chat completions streaming |
| 2: GH Actions + Vercel automation | **In Progress** | PR #1 open; DB proxy tunnels implemented; blocked on origin/main CI issues (Dolt) |

## Fly.io Infrastructure

```
App:      test-preview-agents
Org:      inkeep-46
Region:   iad
Machine:  68349d3b747048 (shared-cpu-4x, 4096MB RAM)
Status:   STOPPED (manually stopped to save costs)

Containers:
  - sidecar   (alpine:3.19 — required by fly deploy)
  - doltgres  (dolthub/doltgresql:0.54.10 — manage DB, port 5432)
  - postgres  (postgres:18 — runtime DB, port 5433)
  - spicedb   (authzed/spicedb:v1.49.1 — authz, ports 50051/8443, memory engine)
```

## Credentials (test only — ephemeral)

```
PG_PASSWORD:    67d86cc721c057b31d771d00662c27d1
SPICEDB_KEY:    783a912d099a05df14eda461fe823a19
AUTH_SECRET:    e48b1aec56c4e96589f1a55b4ccae05187db5dbd13e4e57c61bb622bbd9134b5
BYPASS_SECRET:  test-bypass-secret-for-ci
```

## How to Resume Testing

```bash
# 1. Start the machine
flyctl machine start 68349d3b747048 -a test-preview-agents
sleep 30  # wait for containers to be healthy

# 2. Start proxy tunnels (foreground each in separate terminal, or nohup)
flyctl proxy 15432:5432 -a test-preview-agents &
flyctl proxy 15433:5433 -a test-preview-agents &
flyctl proxy 15051:50051 -a test-preview-agents &
sleep 5

# 3. Re-run migrations + auth init (data is ephemeral — lost on restart)
INKEEP_AGENTS_MANAGE_DATABASE_URL="postgresql://appuser:67d86cc721c057b31d771d00662c27d1@localhost:15432/inkeep_agents" \
INKEEP_AGENTS_RUN_DATABASE_URL="postgresql://appuser:67d86cc721c057b31d771d00662c27d1@localhost:15433/inkeep_agents" \
pnpm db:migrate

INKEEP_AGENTS_MANAGE_DATABASE_URL="postgresql://appuser:67d86cc721c057b31d771d00662c27d1@localhost:15432/inkeep_agents" \
INKEEP_AGENTS_RUN_DATABASE_URL="postgresql://appuser:67d86cc721c057b31d771d00662c27d1@localhost:15433/inkeep_agents" \
SPICEDB_ENDPOINT="localhost:15051" \
SPICEDB_PRESHARED_KEY="783a912d099a05df14eda461fe823a19" \
pnpm db:auth:init

# 4. Start agents-api pointed at Fly DBs
INKEEP_AGENTS_MANAGE_DATABASE_URL="postgresql://appuser:67d86cc721c057b31d771d00662c27d1@localhost:15432/inkeep_agents" \
INKEEP_AGENTS_RUN_DATABASE_URL="postgresql://appuser:67d86cc721c057b31d771d00662c27d1@localhost:15433/inkeep_agents" \
SPICEDB_ENDPOINT="localhost:15051" \
SPICEDB_PRESHARED_KEY="783a912d099a05df14eda461fe823a19" \
BETTER_AUTH_SECRET="e48b1aec56c4e96589f1a55b4ccae05187db5dbd13e4e57c61bb622bbd9134b5" \
INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET="test-bypass-secret-for-ci" \
pnpm --filter agents-api dev

# 5. Seed project (in another terminal)
pnpm inkeep push --project agents-cookbook/template-projects/weather-project \
  --config agents-cookbook/template-projects/inkeep.config.ts --json
# Then push via curl:
curl -X PUT "http://localhost:3002/manage/tenants/default/project-full/my-weather-project" \
  -H "Authorization: Bearer test-bypass-secret-for-ci" \
  -H "Content-Type: application/json" \
  -d @agents-cookbook/template-projects/weather-project/project.json

# 6. Stop when done
flyctl machine stop 68349d3b747048 -a test-preview-agents
pkill -f "flyctl proxy"
```

## Key Findings

1. **Public TCP broken on multi-container Machines** — Fly's experimental edge proxy doesn't route to multi-container. Private network (`flyctl proxy`) works fine. Single-container apps work fine for public TCP.

2. **Doltgres OOMs at 2GB** — Needs 4GB+ RAM for the full container set. Scaled to `shared-cpu-4x --memory 4096`.

3. **Bypass secret auth for seeding** — `inkeep push` CLI uses session tokens that are invalid for a fresh API instance. Use `INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET` as Bearer token via curl to `PUT /manage/tenants/:tenantId/project-full/:projectId`.

4. **Data is ephemeral** — Containers have no persistent volumes. All data is lost on machine stop/restart. Migrations + auth init + project push must run each time.

## Open Decisions

**D11: How does Vercel connect to Fly databases?**
- Public TCP doesn't work (multi-container limitation)
- Options: (A) Run agents-api ON Fly alongside DBs — only HTTP exposure needed, (B) Separate Fly apps per service, (C) WireGuard (unlikely for serverless)
- Recommendation: Option A
- **Note:** For Stage 2, Vercel serverless → Fly public TCP with `pg_tls` DOES work from Node.js (which handles ALPN). The limitation is only Ubuntu system psql on GH runners.

## Stage 2 Iteration Learnings

Hard-won lessons from PR #1 iteration cycles (7 commits, ~5 deploy/debug cycles):

### Fly.io Multi-Container Gotchas

1. **`pg_tls` + Ubuntu psql = "SSL error: no application protocol"**
   - Fly's `pg_tls` handler requires ALPN (Application-Layer Protocol Negotiation)
   - Ubuntu's system `psql` (via `libpq` linked to system OpenSSL) does NOT support ALPN
   - macOS `psql` (Homebrew) works fine — different OpenSSL/libpq build
   - Node.js `pg` driver works fine — uses its own TLS implementation
   - **Solution:** Use `flyctl proxy` tunnels for all GH runner → Fly DB connections. This creates a WireGuard tunnel, bypassing the Fly edge proxy entirely. Connect via `localhost` with `sslmode=disable`.

2. **Dockerfile path resolution is inconsistent**
   - `[build].dockerfile` in `fly.toml` resolves relative to the **config file's directory**
   - `[experimental].machine_config` resolves relative to the **deploy context** (where you run `flyctl deploy`)
   - **Solution:** `cd .fly && flyctl deploy . --config fly.toml` — deploy FROM the `.fly/` dir so all paths resolve consistently

3. **`fly deploy` creates 2 machines by default (HA)**
   - For preview envs, this means duplicate machines, double cost, and TCP services only configured on one
   - **Solution:** `--ha=false` flag

4. **Destroying a Fly app mid-deploy breaks image registry**
   - If you destroy an app while a workflow is pending/running, the next deploy gets `MANIFEST_UNKNOWN` for the sidecar image
   - **Solution:** Let the workflow complete (or cancel it first), then destroy. Or just re-trigger — fresh app + fresh image works.

5. **TCP services must be added post-deploy via Machines REST API**
   - `fly deploy` with `fly.toml` services config does NOT reliably apply TCP services to multi-container Machines
   - Must GET machine config → add services → POST update → wait for restart

### GitHub Actions Gotchas

6. **`${{ steps.*.outputs.* }}` are NOT auto-masked**
   - GH Actions does NOT automatically mask step output values
   - `sed` commands that substitute secrets into files will print the plaintext secret in logs
   - **Solution:** `echo "::add-mask::$SECRET_VALUE"` BEFORE writing to `$GITHUB_OUTPUT`

7. **`superfly/flyctl-actions` tag versioning**
   - `@master` is unstable; `@1.6` doesn't exist as of Feb 2026
   - Latest stable: `@1.5`
   - **Solution:** Pin to `@1.5`

8. **`flyctl proxy` port mapping**
   - `flyctl proxy LOCAL_PORT:REMOTE_PORT` — local port must not conflict
   - For Postgres on remote port 5433, use `flyctl proxy 15433:5433` to avoid conflicts
   - Proxy processes run as background jobs — they die when the GH Actions step runner exits

### Architecture Notes

9. **Vercel env vars use public Fly URLs; GH runner uses proxy tunnels**
   - Two different connectivity paths for the same databases
   - Vercel serverless functions connect over the internet via Fly public TCP (Node.js handles ALPN)
   - GH runner connects via WireGuard proxy tunnels (Ubuntu psql can't do ALPN)
   - This distinction is important — don't accidentally set Vercel env vars to `localhost`

10. **SpiceDB memory engine = no persistence**
    - Using `SPICEDB_DATASTORE_ENGINE=memory` means schema + relationships lost on restart
    - Must re-run `db:auth:init` (SpiceDB schema write) every deploy
    - This is fine for ephemeral preview envs

### Blockers for Next Session

- **origin/main CI issues**: Dolt-related CI failures on main prevent the `pnpm db:migrate` step from succeeding even if DB connectivity works. Fix main CI first, then re-test.
- **Fly app destroyed**: `pr-1-agents` destroyed. Workflow will recreate on next push.
- **Last commit**: `b23ef3e7c` — flyctl proxy tunnels for all DB connections. Untested due to main CI blocker.

## Files

```
.fly/Dockerfile           — Minimal sidecar (alpine, sleep infinity)
.fly/fly.toml             — Fly app config
.fly/machine-config.json  — Multi-container Machine definition (4 containers)
.github/workflows/preview-env.yml     — PR preview deploy/teardown workflow (20 steps)
.github/workflows/preview-cleanup.yml — Weekly orphan cleanup cron
specs/pr-preview-environments/SPEC.md     — Full spec (Section 15 = validation results)
specs/pr-preview-environments/PROGRESS.md — This file
```
