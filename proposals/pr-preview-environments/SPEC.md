# Per-PR Preview Environments — Spec

**Status:** Draft — Stage 2 in progress (GH Actions workflow implemented, DB proxy tunnels untested)
**Owner(s):** Edwin
**Last updated:** 2026-02-23
**Links:**
- Research report: `~/.claude/reports/pr-preview-environments/REPORT.md`
- Evidence: `./evidence/` (spec-local findings)

---

## 1) Problem statement

- **Who is affected:** All engineers working on the agents monorepo
- **What pain:** Today there is no way to test a PR against a real backend stack. Local development uses `docker-compose.dbs.yml` for core databases and `agents-optional-local-dev` for observability/integration services, but Vercel preview deployments have no backend services at all. Engineers cannot test schema changes, API behavior, UI flows, Nango integrations, or trace observability against real infrastructure in a PR preview. Cross-cutting changes (schema + API + UI) require local testing only.
- **Why now:** As the team grows and the product surface area expands, the gap between "works locally" and "works in production" creates bugs that slip through. PR reviews lack a live environment to validate against.
- **Current workaround(s):**
  - Local dev via `pnpm setup-dev` (core DBs) + `pnpm setup-dev:optional` (Nango, SigNoz, OTEL, Jaeger)
  - CI Cypress tests run against GH Actions service containers (Doltgres, Postgres, SpiceDB in memory mode) — ephemeral to the CI run
  - No workaround for previewing a full stack from a PR link

## 2) Goals

- **G1:** Every PR automatically gets a fully isolated backend stack — databases (Doltgres, Postgres), authorization (SpiceDB), integrations (Nango), and observability (SigNoz, OTEL Collector, Jaeger) — that Vercel preview deployments connect to. Full end-to-end parity with local dev.
- **G2:** Zero manual setup per PR — lifecycle fully managed by GitHub Actions (create on open, destroy on close/merge)
- **G3:** Schema-changing PRs work correctly — migrations run against the PR's own databases using the PR branch's migration files
- **G4:** End-to-end connectivity — manage-ui preview connects to agents-api preview, which connects to the PR's isolated Fly.io backend. Cookie-based auth works across preview URLs.
- **G5:** Cost-efficient — ephemeral resources, pay only while PR is open

## 3) Non-goals

- **NG1:** Production hosting — this is for preview/dev environments only
- **NG2:** Kubernetes, Helm, or complex orchestration — the architecture should be as simple as docker-compose
- **NG3:** Data persistence across PR updates — fresh databases on each PR environment creation is acceptable
- **NG4:** Performance optimization of preview environments — they need to work, not be fast

## 4) Personas / consumers

- **P1: PR author** — pushes code, clicks Vercel preview link, expects a working full-stack environment
- **P2: PR reviewer** — clicks the preview link to manually test the PR before approving
- **P3: CI/automation** — GitHub Actions manages the lifecycle without human intervention

## 5) User journeys

### PR Author (happy path)
1. Engineer opens a PR against `main`
2. GitHub Actions workflow triggers automatically
3. Fly.io backend spins up all services (databases, SpiceDB, Nango, SigNoz, OTEL, Jaeger)
4. Migrations run against the PR's databases using the PR branch's schema
5. SigNoz admin is auto-created, Nango keys are generated
6. Branch-scoped Vercel env vars are set on both `agents-api` and `agents-manage-ui` projects
7. Custom preview domain aliases are added: `pr-{n}-api.preview.inkeep.com`, `pr-{n}-ui.preview.inkeep.com`
8. Vercel redeploy is triggered for both projects (picks up new env vars)
9. PR gets a comment with preview URLs
10. Engineer clicks `pr-{n}-ui.preview.inkeep.com` → fully functional environment with auth, traces, integrations

### PR Author (update)
1. Engineer pushes new commits to the PR branch
2. `synchronize` event triggers the workflow
3. Fly.io backend is already running — workflow is idempotent (re-creates if needed)
4. Migrations re-run (handles schema changes in new commits)
5. Vercel auto-deploys with existing branch-scoped env vars
6. Preview continues working

### PR Author (failure/recovery)
- Fly.io deployment fails → GH Actions logs error, posts comment with diagnostic info
- Migration fails → GH Actions posts error with migration logs to PR comment
- Vercel env var set fails → workflow logs error; next push retriggers

### PR Close (cleanup)
1. PR is merged or closed
2. GitHub Actions workflow triggers teardown
3. `flyctl apps destroy pr-{n}-agents --yes` cleans up all Fly resources
4. Vercel custom domain aliases are removed
5. Vercel branch-scoped env vars become inert (branch no longer exists)

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria |
|---|---|---|
| Must | Fly.io backend auto-created on PR open | `flyctl apps list` shows `pr-{n}-agents` within 8 min of PR open |
| Must | All 11 services running (after init containers exit) | Doltgres, Postgres, SpiceDB, Nango (server+db+redis), SigNoz (zookeeper+clickhouse+server+otel-collector), OTEL Collector, Jaeger all healthy |
| Must | Migrations run from PR branch | `pnpm db:migrate` succeeds against Fly databases using PR's migration files |
| Must | Auth init runs | `pnpm db:auth:init` creates admin user + SpiceDB schema in the PR's databases |
| Must | Nango configured with generated keys | `NANGO_ENCRYPTION_KEY` and `NANGO_SECRET_KEY` generated per PR; Nango health check passes |
| Must | SigNoz admin + PAT auto-created | API calls create admin user and Personal Access Token; `SIGNOZ_API_KEY` set |
| Must | Vercel agents-api gets branch-scoped env vars | All database, SpiceDB, Nango, SigNoz, OTEL env vars set for the PR branch |
| Must | Vercel agents-manage-ui gets branch-scoped env vars | `INKEEP_AGENTS_API_URL`, `PUBLIC_INKEEP_AGENTS_API_URL`, SigNoz vars set for the PR branch |
| Must | Custom preview domains assigned | `pr-{n}-api.preview.inkeep.com` and `pr-{n}-ui.preview.inkeep.com` point to correct deployments |
| Must | Cookie-based auth works across preview URLs | manage-ui can authenticate against agents-api using shared `.preview.inkeep.com` cookie domain |
| Must | CORS allows manage-ui → agents-api requests | Origin `pr-{n}-ui.preview.inkeep.com` allowed by agents-api CORS middleware |
| Must | Fly.io backend destroyed on PR close | No Fly apps remaining for closed PRs. Domain aliases removed. |
| Must | Production unaffected | Workflow never modifies production env vars, production domains, or production Fly resources |
| Should | PR comment with preview status/URLs | Bot comment shows Fly status + preview URLs + admin credentials |
| Should | Concurrent PRs work independently | 5+ PRs can have independent backends simultaneously |
| Should | Workflow is idempotent | Re-running on same PR updates rather than duplicates |
| Could | Auto-stop idle Fly Machines | Machines stop after idle period, restart on request |

### Non-functional requirements

- **Startup time:** Full stack healthy within 8 minutes of workflow start (SigNoz stack is slow — 4min alone)
- **Reliability:** >95% of PRs get a working environment on first attempt
- **Security:** All credentials random per PR, masked in GH Actions logs. No production secrets in preview environments. Database ports protected by random passwords.
- **Cost:** `shared-cpu-8x` (8GB RAM) at ~$0.066/hr per PR. Target: <$110/month for typical usage (10 concurrent PRs, 8h/day, 20 days)
- **Operability:** Fly.io dashboard shows all preview apps. GH Actions logs sufficient for debugging.
- **Isolation:** Each PR's environment is completely independent — no shared databases, no shared state.

## 7) Success metrics & instrumentation

- **Metric 1:** Time from PR open to fully healthy environment
  - Baseline: N/A (no preview environments today)
  - Target: <8 minutes
  - Instrumentation: GH Actions step timing
- **Metric 2:** Preview environment reliability
  - Baseline: N/A
  - Target: >95% success rate on first attempt
  - Instrumentation: GH Actions workflow success/failure rate
- **Metric 3:** Cost per month
  - Target: <$110/month
  - Instrumentation: Fly.io billing dashboard
- **What we will log:** Fly app creation time, per-service health check times, migration duration, SigNoz setup time, Vercel redeploy status, teardown confirmation

## 8) Current state (how it works today)

### Local development (core)
- `pnpm setup-dev` runs 8 steps via `packages/agents-core/src/setup/setup.ts`:
  1. Environment config (`.env` from `.env.example`)
  2. JWT key generation
  3. Docker startup (`docker-compose.dbs.yml` — Doltgres, Postgres, SpiceDB + backing Postgres + migrate)
  4. Health check polling (60s Doltgres, 30s Postgres, 30s SpiceDB)
  5. Database migrations (`pnpm db:manage:migrate` + `pnpm db:run:migrate` in parallel)
  6. Auth initialization (admin user + SpiceDB schema)
  7-8. Optional project push (weather-project template)

### Local development (optional services)
- `pnpm setup-dev:optional` via `scripts/setup-optional.sh`:
  1. Clones `inkeep/agents-optional-local-dev` into `.optional-services/`
  2. Generates `NANGO_ENCRYPTION_KEY` (base64 random 32 bytes) and `NANGO_SECRET_KEY` (UUID v4)
  3. Starts Docker Compose with profiles: nango, signoz, otel-collector, jaeger
  4. Health-checks Nango (180s timeout), SigNoz (240s timeout)
  5. SigNoz automation: POST `/api/v1/register` → POST `/api/v1/login` → POST `/api/v1/pats` (admin PAT)
  6. Writes all env vars to caller `.env` (Nango URLs, OTEL endpoint, SigNoz URL + API key)

### CI (Cypress E2E)
- GH Actions service containers: Doltgres (5432), Postgres (5433)
- SpiceDB runs via `docker run` with `SPICEDB_DATASTORE_ENGINE=memory`
- Migrations run via `pnpm setup-dev --skip-push`
- No optional services in CI

### Production deployment
- `vercel-production.yml` matrix deploys `agents-api` and `agents-manage-ui` on release
- Two production-like environments:
  - **Production:** `api.agents.inkeep.com` + `app.inkeep.com` (AUTH_COOKIE_DOMAIN=`.inkeep.com`)
  - **Pilot:** `api.pilot.inkeep.com` + `pilot.inkeep.com` (cookie domain auto-computes to `.pilot.inkeep.com`)
- Database connections configured via Vercel env vars pointing to cloud-managed services
- No preview-specific backend infrastructure exists

### Vercel project structure
- `agents-api` — Hono framework, custom `vercel.json` with queue triggers, maxDuration 800s
- `agents-manage-ui` — Next.js auto-detected, no vercel.json
- Both under Vercel team `inkeep`
- `*.preview.inkeep.com` wildcard DNS already configured and used by 60+ projects across the org

### Key constraints
- `.vercel.app` is a Public Suffix — cookies CANNOT be shared across Vercel preview subdomains. Custom `*.preview.inkeep.com` domains are required for cross-service auth.
- CORS middleware (`agents-api/src/middleware/cors.ts`) uses `getBaseDomain()` — all `*.preview.inkeep.com` subdomains share base domain `preview.inkeep.com` and are auto-allowed.
- Cookie domain auto-computes via `extractCookieDomain()` — `pr-{n}-api.preview.inkeep.com` → `.preview.inkeep.com`. No AUTH_COOKIE_DOMAIN override needed.
- SpiceDB TLS auto-detection: non-localhost endpoints trigger TLS by default — must set `SPICEDB_TLS_ENABLED=false`.
- manage-ui resolves agents-api URL at runtime (not build time) via `RuntimeConfigProvider`.
- Nango `providers.yaml` is 17,404 lines — needs to be available in the Fly container.

## 9) Proposed solution (vertical slice)

### Architecture overview

```
GitHub PR Lifecycle:

  PR Opened/Synchronized:
    ┌──────────────────────────────────────────────────────────────────────────┐
    │  GitHub Actions Workflow (.github/workflows/preview-env.yml)             │
    │                                                                          │
    │  1. Create Fly app: pr-{n}-agents (org: inkeep-46, region: iad)         │
    │  2. Deploy multi-container Machine:                                      │
    │     ┌───────────────────────────────────────────────────────────┐        │
    │     │  Fly.io Machine (shared-cpu-8x, 8GB RAM)                  │        │
    │     │  All containers share localhost networking                 │        │
    │     │                                                           │        │
    │     │  CORE:                                                    │        │
    │     │    Doltgres      (:5432)  ─── manage database             │        │
    │     │    Postgres      (:5433)  ─── runtime database            │        │
    │     │    SpiceDB       (:50051) ─── authorization (memory)      │        │
    │     │                                                           │        │
    │     │  INTEGRATIONS:                                            │        │
    │     │    Nango Server   (:3050)  ─── OAuth/MCP integrations     │        │
    │     │    Nango Postgres (internal) ── Nango backing store       │        │
    │     │    Nango Redis   (internal) ── Nango queue/cache          │        │
    │     │                                                           │        │
    │     │  OBSERVABILITY:                                           │        │
    │     │    ZooKeeper     (internal) ── ClickHouse coordinator     │        │
    │     │    ClickHouse    (:8123)    ── SigNoz data store          │        │
    │     │    SigNoz Server (:3080)    ── traces/metrics UI + API    │        │
    │     │    SigNoz OTEL   (:4317)    ── SigNoz trace receiver      │        │
    │     │    OTEL Collector(:14317)   ── trace router (→SigNoz+Jgr) │        │
    │     │    Jaeger        (:16686)   ── lightweight trace viewer    │        │
    │     │                                                           │        │
    │     │  INIT (exit after completion):                            │        │
    │     │    init-clickhouse ── downloads histogramQuantile binary   │        │
    │     │    schema-migrator-sync ── ClickHouse schema sync         │        │
    │     │    schema-migrator-async ── ClickHouse async migration    │        │
    │     └───────────────────────────────────────────────────────────┘        │
    │                                                                          │
    │  3. Run migrations from PR branch (GH Actions runner → Fly databases)   │
    │  4. Init auth (admin user + SpiceDB schema)                             │
    │  5. SigNoz admin + PAT creation (API calls from GH Actions runner)      │
    │  6. Set branch-scoped Vercel env vars on agents-api project             │
    │  7. Set branch-scoped Vercel env vars on agents-manage-ui project       │
    │  8. Add custom domain aliases:                                           │
    │     pr-{n}-api.preview.inkeep.com → agents-api deployment               │
    │     pr-{n}-ui.preview.inkeep.com  → agents-manage-ui deployment         │
    │  9. Trigger Vercel redeploy for both projects                           │
    │  10. Post PR comment with preview URLs + admin credentials              │
    └──────────────────────────────────────────────────────────────────────────┘

  Runtime connectivity (after deployment):

    Browser
      │
      ▼
    pr-{n}-ui.preview.inkeep.com  (agents-manage-ui on Vercel)
      │   cookie domain: .preview.inkeep.com
      │   CORS: auto-allowed (shared base domain)
      ▼
    pr-{n}-api.preview.inkeep.com  (agents-api on Vercel)
      │
      ├──► Doltgres    @ pr-{n}-agents.fly.dev:5432  (manage DB)
      ├──► Postgres    @ pr-{n}-agents.fly.dev:5433  (runtime DB)
      ├──► SpiceDB     @ pr-{n}-agents.fly.dev:50051 (authz, gRPC)
      ├──► Nango       @ pr-{n}-agents.fly.dev:3050  (integrations)
      ├──► SigNoz      @ pr-{n}-agents.fly.dev:3080  (traces API)
      └──► OTEL        @ pr-{n}-agents.fly.dev:14317 (trace export)

  PR Closed/Merged:
    flyctl apps destroy pr-{n}-agents --yes
    vercel domains rm pr-{n}-api.preview.inkeep.com
    vercel domains rm pr-{n}-ui.preview.inkeep.com
```

### Fly.io Machine configuration

**VM size:** `shared-cpu-8x`, 8GB RAM, region `iad` (US East)
**Org:** `inkeep-46`

#### Core database containers

**Doltgres** (`dolthub/doltgresql:0.54.10`)
- Port 5432 (PostgreSQL wire protocol)
- Env: `DOLTGRES_USER`, `DOLTGRES_PASSWORD`, `DOLTGRES_DB`
- Healthcheck: `psql -U $DOLTGRES_USER -d $DOLTGRES_DB -c 'SELECT 1'`

**Postgres** (`postgres:18`)
- Port 5433 (via `PGPORT=5433` to avoid conflict)
- Env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `PGPORT=5433`
- Healthcheck: `pg_isready -p 5433`

**SpiceDB** (`authzed/spicedb:v1.49.1`)
- Ports: 50051 (gRPC), 8443 (HTTP)
- CMD: `serve`
- Env: `SPICEDB_DATASTORE_ENGINE=memory`, `SPICEDB_GRPC_PRESHARED_KEY`, `SPICEDB_HTTP_ENABLED=true`
- No backing Postgres needed (memory engine, matching CI pattern)

#### Integration containers

**Nango Server** (`nangohq/nango-server:hosted-0.69.31`)
- Ports: 3050 (API), 3051 (Connect UI)
- Env: `NANGO_ENCRYPTION_KEY`, `NANGO_SECRET_KEY_DEV`, `NANGO_DB_HOST=localhost`, `NANGO_DB_USER`, `NANGO_DB_PASSWORD`, `NANGO_DB_NAME=nango`, `NANGO_SERVER_URL`, `SERVER_PORT=3050`, `FLAG_AUTH_ENABLED=false`
- Volume: `providers.yaml` (17K lines, baked into Dockerfile)
- Depends on: Nango Postgres, Nango Redis

**Nango Postgres** (`postgres:16.0-alpine`)
- Internal only (no public port)
- Env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=nango`

**Nango Redis** (`redis:7.2.4`)
- Internal only (no public port)

#### Observability containers

**ZooKeeper** (`signoz/zookeeper:3.7.1`)
- Internal only
- Env: `ZOO_SERVER_ID=1`, `ALLOW_ANONYMOUS_LOGIN=yes`
- Healthcheck: `curl -s -m 2 http://localhost:8080/commands/ruok`

**ClickHouse** (`clickhouse/clickhouse-server:25.5.6`)
- Port 8123 (HTTP, internal), Port 9000 (native, internal)
- Config files: `cluster.xml`, `config.xml`, `users.xml`, `custom-function.xml`
- Depends on: ZooKeeper healthy, init-clickhouse completed

**SigNoz Server** (`signoz/signoz:v0.96.1`)
- Port 3080 (HTTP — traces API + UI)
- Env: `SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN=tcp://localhost:9000`, `STORAGE=clickhouse`
- Depends on: ClickHouse healthy, schema-migrator-sync completed

**SigNoz OTEL Collector** (`signoz/signoz-otel-collector:v0.129.6`)
- Ports: 4317 (gRPC), 4318 (HTTP)
- Depends on: SigNoz Server healthy

**OTEL Collector** (`otel/opentelemetry-collector:0.135.0`)
- Ports: 14317 (gRPC), 14318 (HTTP)
- Config: routes traces to both SigNoz (`localhost:4317`) and Jaeger (`localhost:24317`)
- This is the collector that agents-api sends traces to

**Jaeger** (`jaegertracing/all-in-one:1.73.0`)
- Ports: 16686 (UI), 24317 (OTLP gRPC), 24318 (OTLP HTTP)
- Zero config needed

#### Init containers (run and exit)

**init-clickhouse** (`clickhouse/clickhouse-server:25.5.6`)
- Downloads `histogramQuantile` binary from GitHub releases
- Exits successfully after download

**schema-migrator-sync** (`signoz/signoz-schema-migrator:v0.129.6`)
- CMD: `sync --dsn=tcp://localhost:9000 --up=`
- Depends on: ClickHouse healthy

**schema-migrator-async** (`signoz/signoz-schema-migrator:v0.129.6`)
- CMD: `async --dsn=tcp://localhost:9000 --up=`
- Depends on: ClickHouse healthy, schema-migrator-sync completed

### Fly services (port exposure)

TCP services are configured post-deploy via the Machines API (`POST /v1/apps/{app}/machines/{id}`), NOT via fly.toml. Each service requires a Fly Proxy handler that determines how TLS is terminated. A **dedicated IPv4** (~$2/mo per app) is required — shared IPv4 uses SNI routing which only works for HTTP/TLS.

**Stage 2 validated** (2026-02-19, see `evidence/stage2-tcp-validation.md`):

| Port | Protocol | Service | Fly Handler | Purpose | Gotcha |
|---|---|---|---|---|---|
| 5432 | TCP | Doltgres | `pg_tls` | PostgreSQL wire protocol (manage DB) | **ALPN issue:** `pg_tls` requires ALPN negotiation. Node.js `pg` driver handles this (use `sslmode=require`). Ubuntu system `psql` does NOT support ALPN — produces "SSL error: no application protocol". GH Actions runners use Ubuntu → must use `flyctl proxy` tunnels with `sslmode=disable` for health checks/migrations. |
| 5433 | TCP | Postgres | `pg_tls` | PostgreSQL wire protocol (runtime DB) | Same ALPN issue as Doltgres. |
| 50051 | TCP | SpiceDB | `[]` (raw passthrough) | gRPC authorization | gRPC needs ALPN `h2` — Fly's `tls` handler breaks it. Use `-plaintext` + `SPICEDB_TLS_ENABLED=false` |
| 8443 | TCP | SpiceDB | `tls` | HTTP health check (grpc-gateway) | Use `curl -k` (auto-generated certs) |
| 3050 | HTTP | Nango | — | Integration API | Stage 1B |
| 3080 | HTTP | SigNoz | — | Traces API + UI | Stage 1B |
| 14317 | TCP | OTEL Collector | — | OTLP gRPC trace export | Stage 1B |
| 14318 | HTTP | OTEL Collector | — | OTLP HTTP trace export | Stage 1B |
| 16686 | HTTP | Jaeger | — | Trace viewer UI | Stage 1B |

**Two different connectivity paths exist:**
- **Vercel serverless → Fly (runtime):** Direct TCP over the public internet. Node.js `pg` driver handles `pg_tls` ALPN correctly. Use `sslmode=require`.
- **GH Actions runner → Fly (CI — health checks, migrations, auth init):** Must use `flyctl proxy` WireGuard tunnels. Ubuntu's system `psql` cannot negotiate ALPN with Fly's `pg_tls` handler. Connect via `localhost` with `sslmode=disable`.

Services JSON applied via Machines API:
```json
{
  "services": [
    {"protocol":"tcp","internal_port":5432,"ports":[{"port":5432,"handlers":["pg_tls"]}]},
    {"protocol":"tcp","internal_port":5433,"ports":[{"port":5433,"handlers":["pg_tls"]}]},
    {"protocol":"tcp","internal_port":50051,"ports":[{"port":50051,"handlers":[]}]},
    {"protocol":"tcp","internal_port":8443,"ports":[{"port":8443,"handlers":["tls"]}]}
  ]
}
```

Internal-only ports (not exposed through Fly services): Nango Postgres, Nango Redis, ZooKeeper, ClickHouse (8123, 9000), SigNoz OTEL Collector (4317, 4318), Jaeger OTLP (24317, 24318).

### Config files strategy

SigNoz, Nango, and OTEL Collector require config files that are normally volume-mounted from the `agents-optional-local-dev` companion repo. For Fly.io:

**Approach:** Build a lightweight Dockerfile (`.fly/Dockerfile.preview`) that:
1. Uses a minimal base image (e.g., `alpine`)
2. Copies config files from the repo into known paths
3. The multi-container fly.toml references these paths

Config files to include:
- `signoz/clickhouse/cluster.xml`, `config.xml`, `users.xml`, `custom-function.xml`
- `signoz/signoz/prometheus.yml`, `otel-collector-opamp-config.yaml`
- `signoz/otel-collector-config.yaml`
- `otel-collector/otel-collector-config.yaml` (modified: `host.docker.internal` → `localhost`)
- `nango/providers.yaml`

These configs live in the `agents-optional-local-dev` repo. The Dockerfile fetches them via GitHub raw URL or the workflow checks out the companion repo and copies files.

### Migration strategy

Migrations run from the GitHub Actions runner via **`flyctl proxy` WireGuard tunnels** (not direct TCP — see "ALPN issue" above):

1. The PR branch's migration files are used (handles schema-changing PRs)
2. No Docker image build needed for migrations
3. Same tooling as local dev (`pnpm db:migrate`, `pnpm db:auth:init`)
4. Connection strings use `sslmode=disable` through the proxy tunnel (localhost, no TLS needed)
5. `flyctl proxy` background processes are started before health checks and kept alive through migrations

**Why not direct TCP?** Fly's `pg_tls` handler requires ALPN (Application-Layer Protocol Negotiation). Ubuntu's system `psql` and `libpq` on GH Actions runners do not support ALPN, producing "SSL error: no application protocol". Node.js `pg` driver handles ALPN correctly (which is why Vercel serverless works with direct TCP), but the GH runner also uses `psql` for health checks.

```bash
# Start proxy tunnels (background, kept alive through the job)
flyctl proxy 5432:5432 -a pr-{n}-agents &     # Doltgres
flyctl proxy 15433:5433 -a pr-{n}-agents &    # Postgres (local port 15433 to avoid conflicts)
flyctl proxy 50051:50051 -a pr-{n}-agents &   # SpiceDB gRPC
sleep 3

# Build agents-core + CLI + SDK (required for migration scripts)
pnpm exec turbo build --filter=@inkeep/agents-core --filter=@inkeep/agents-cli --filter=@inkeep/agents-sdk

# Run migrations via proxy tunnels (localhost, sslmode=disable)
INKEEP_AGENTS_MANAGE_DATABASE_URL="postgresql://appuser:$PG_PASSWORD@localhost:5432/inkeep_agents?sslmode=disable" \
INKEEP_AGENTS_RUN_DATABASE_URL="postgresql://appuser:$PG_PASSWORD@localhost:15433/inkeep_agents?sslmode=disable" \
pnpm db:migrate

# Init auth (SpiceDB schema + org + admin user, via proxy tunnels)
# SPICEDB_TLS_ENABLED=false is required because getSpiceDbConfig() auto-enables TLS for non-localhost endpoints
INKEEP_AGENTS_MANAGE_DATABASE_URL="postgresql://appuser:$PG_PASSWORD@localhost:5432/inkeep_agents?sslmode=disable" \
INKEEP_AGENTS_RUN_DATABASE_URL="postgresql://appuser:$PG_PASSWORD@localhost:15433/inkeep_agents?sslmode=disable" \
SPICEDB_ENDPOINT=localhost:50051 \
SPICEDB_PRESHARED_KEY=$SPICEDB_KEY \
SPICEDB_TLS_ENABLED=false \
BETTER_AUTH_SECRET=$AUTH_SECRET \
INKEEP_AGENTS_MANAGE_UI_USERNAME=admin \
INKEEP_AGENTS_MANAGE_UI_PASSWORD=$ADMIN_PASSWORD \
pnpm db:auth:init
```

### Auto-provisioning (user + project)

After `db:auth:init`, the preview environment has:
- Organization: `default`
- Admin user: `admin@preview.inkeep.com` with generated password
- SpiceDB schema with authorization model
- Admin membership in the org (SpiceDB relationship synced)

The user can immediately log into manage-ui. However, **no projects exist yet**. To seed a project:

```bash
# Wait for agents-api Vercel preview to be healthy
# Then seed via bypass secret (same pattern as pnpm setup-dev)
curl -X PUT "https://pr-{n}-api.preview.inkeep.com/manage/tenants/default/project-full/weather-project" \
  -H "Authorization: Bearer $BYPASS_SECRET" \
  -H "Content-Type: application/json" \
  -d @agents-cookbook/template-projects/weather-project/project.json
```

**Note**: This requires agents-api to be live on Vercel with env vars applied. The workflow seeds after Vercel redeploy completes. The template project JSON needs to be checked in at `agents-cookbook/template-projects/weather-project/project.json` (may need to be generated once via `inkeep push --json`).

### SigNoz automation (post-deploy)

After SigNoz is healthy, the workflow runs the same automation as `setup-dev:optional`:

```bash
# Register admin user (idempotent)
curl -s -X POST http://pr-{n}-agents.fly.dev:3080/api/v1/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Admin","email":"admin@localhost.dev","password":"LocalDev1234@","orgName":"preview"}'

# Login to get JWT
JWT=$(curl -s -X POST http://pr-{n}-agents.fly.dev:3080/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@localhost.dev","password":"LocalDev1234@"}' | jq -r '.accessJwt')

# Create Personal Access Token
SIGNOZ_API_KEY=$(curl -s -X POST http://pr-{n}-agents.fly.dev:3080/api/v1/pats \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"name":"preview-env","role":"ADMIN","expiresInDays":30}' | jq -r '.token')
```

### Custom preview domain strategy

`*.preview.inkeep.com` wildcard DNS is already configured (CNAME → `cname.vercel-dns.com`) and actively used by 60+ projects across the Vercel team. No DNS setup needed.

**Constraint**: A wildcard domain can only be assigned to ONE Vercel project. So we add **specific subdomains** per-PR to each project via the Vercel REST API:

Per PR, the workflow:
1. **Add domains** to each Vercel project (can run in parallel with deploy):
   ```bash
   # agents-api project
   curl -X POST "https://api.vercel.com/v10/projects/${API_PROJECT_ID}/domains?teamId=${ORG_ID}" \
     -H "Authorization: Bearer $VERCEL_TOKEN" \
     -d '{"name": "pr-{n}-api.preview.inkeep.com"}'

   # manage-ui project
   curl -X POST "https://api.vercel.com/v10/projects/${UI_PROJECT_ID}/domains?teamId=${ORG_ID}" \
     -H "Authorization: Bearer $VERCEL_TOKEN" \
     -d '{"name": "pr-{n}-ui.preview.inkeep.com"}'
   ```
2. **Deploy** both projects (Vercel auto-deploys on push, or explicit `vercel deploy`)
3. **Alias** each deployment to its custom domain:
   - `vercel alias set <agents-api-deployment> pr-{n}-api.preview.inkeep.com`
   - `vercel alias set <manage-ui-deployment> pr-{n}-ui.preview.inkeep.com`
4. **On PR close**: Remove domains from both projects:
   ```bash
   curl -X DELETE "https://api.vercel.com/v9/projects/${API_PROJECT_ID}/domains/pr-{n}-api.preview.inkeep.com?teamId=${ORG_ID}" \
     -H "Authorization: Bearer $VERCEL_TOKEN"
   ```

Domain registration is near-instant (no DNS propagation needed — wildcard CNAME already covers all subdomains). Vercel rate limit: 100 domain ops/min.

This gives us:
- **CORS:** Auto-allowed — both subdomains share base domain `preview.inkeep.com` (existing `isOriginAllowed()` logic matches 3-part base domains)
- **Cookies:** `extractCookieDomain()` auto-computes `.preview.inkeep.com` from 4-part hostnames — shared across both services
- **Deterministic URLs:** `pr-{n}-api.preview.inkeep.com` and `pr-{n}-ui.preview.inkeep.com` — computable before deploy from PR number alone
- **No code changes needed** — CORS and cookie logic already support this pattern

### Vercel env var injection

Branch-scoped env vars set via Vercel REST API with `?upsert=true` (handles both create and update on subsequent pushes):

```bash
curl -X POST "https://api.vercel.com/v10/projects/${PROJECT_ID}/env?upsert=true&teamId=${ORG_ID}" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"VAR_NAME","value":"value","type":"encrypted","target":["preview"],"gitBranch":"branch-name"}'
```

#### agents-api project

| Env Var | Value | Type | Notes |
|---|---|---|---|
| `INKEEP_AGENTS_MANAGE_DATABASE_URL` | `postgresql://appuser:{pw}@pr-{n}-agents.fly.dev:5432/inkeep_agents?sslmode=require` | encrypted | `sslmode=require` — Node.js `pg` handles `pg_tls` ALPN correctly |
| `INKEEP_AGENTS_RUN_DATABASE_URL` | `postgresql://appuser:{pw}@pr-{n}-agents.fly.dev:5433/inkeep_agents?sslmode=require` | encrypted | Same |
| `SPICEDB_ENDPOINT` | `pr-{n}-agents.fly.dev:50051` | encrypted | |
| `SPICEDB_PRESHARED_KEY` | `{random}` | encrypted | |
| `SPICEDB_TLS_ENABLED` | `false` | plain | Required — `getSpiceDbConfig()` auto-enables TLS for non-localhost endpoints |
| `BETTER_AUTH_SECRET` | `{random}` | encrypted | |
| `INKEEP_AGENTS_API_URL` | `https://pr-{n}-api.preview.inkeep.com` | plain | Self-referential URL for Better Auth baseURL |
| `INKEEP_AGENTS_MANAGE_UI_URL` | `https://pr-{n}-ui.preview.inkeep.com` | plain | CORS allowlist + Better Auth trustedOrigins |
| `INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET` | `{random}` | encrypted | For machine-to-machine auth (seeding, CI) |
| `INKEEP_AGENTS_MANAGE_UI_USERNAME` | `admin@preview.inkeep.com` | plain | Admin user for `db:auth:init` |
| `INKEEP_AGENTS_MANAGE_UI_PASSWORD` | `{random}` | encrypted | Admin password |
| `ANTHROPIC_API_KEY` | `{from GH secret}` | encrypted | Real agents in preview |
| `OPENAI_API_KEY` | `{from GH secret}` | encrypted | Real agents in preview |
| `WORKFLOW_TARGET_WORLD` | `local` | plain | No Vercel queue in preview |
| `NANGO_SERVER_URL` | `http://pr-{n}-agents.fly.dev:3050` | plain | Stage 1B |
| `NANGO_SECRET_KEY` | `{generated-uuid}` | encrypted | Stage 1B |
| `PUBLIC_NANGO_SERVER_URL` | `http://pr-{n}-agents.fly.dev:3050` | plain | Stage 1B |
| `PUBLIC_NANGO_CONNECT_BASE_URL` | `http://pr-{n}-agents.fly.dev:3051` | plain | Stage 1B |
| `SIGNOZ_URL` | `http://pr-{n}-agents.fly.dev:3080` | plain | Stage 1B |
| `SIGNOZ_API_KEY` | `{auto-generated}` | encrypted | Stage 1B |
| `PUBLIC_SIGNOZ_URL` | `http://pr-{n}-agents.fly.dev:3080` | plain | Stage 1B |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `http://pr-{n}-agents.fly.dev:14318/v1/traces` | plain | Stage 1B |
| `OTEL_SERVICE_NAME` | `inkeep-agents-preview` | plain | Stage 1B |

#### agents-manage-ui project

| Env Var | Value | Type | Notes |
|---|---|---|---|
| `INKEEP_AGENTS_API_URL` | `https://pr-{n}-api.preview.inkeep.com` | plain | Server-side API calls |
| `PUBLIC_INKEEP_AGENTS_API_URL` | `https://pr-{n}-api.preview.inkeep.com` | plain | Client-side (browser) API calls |
| `INKEEP_AGENTS_MANAGE_UI_USERNAME` | `admin@preview.inkeep.com` | plain | Auto-login credentials |
| `INKEEP_AGENTS_MANAGE_UI_PASSWORD` | `{random}` | encrypted | Auto-login credentials |
| `PUBLIC_SIGNOZ_URL` | `http://pr-{n}-agents.fly.dev:3080` | plain | Stage 1B |
| `SIGNOZ_URL` | `http://pr-{n}-agents.fly.dev:3080` | plain | Stage 1B |
| `SIGNOZ_API_KEY` | `{auto-generated}` | encrypted | Stage 1B |
| `PUBLIC_NANGO_SERVER_URL` | `http://pr-{n}-agents.fly.dev:3050` | plain | Stage 1B |
| `PUBLIC_NANGO_CONNECT_BASE_URL` | `http://pr-{n}-agents.fly.dev:3051` | plain | Stage 1B |

All vars use `target: ["preview"]` with `gitBranch: ${{ github.head_ref }}`. The `?upsert=true` query parameter ensures idempotent updates on `synchronize` events (new pushes to existing PRs).

### Deployment coordination

The key timing challenge: Vercel's Git integration auto-deploys on push, but our workflow needs to set env vars BEFORE the build picks them up. Strategy:

1. **Vercel auto-deploys** on push (this is unavoidable and starts immediately)
2. **Our workflow runs in parallel:** Fly deploy → migrations → env vars
3. **After env vars are set:** Trigger an explicit Vercel redeploy using the Vercel API
   - `POST /v13/deployments` with `gitSource` pointing to the same commit
   - This creates a second deployment that picks up the branch-scoped env vars
4. **After redeploy completes:** Add custom domain aliases pointing to the new deployment
5. The first auto-deploy becomes a wasted build — acceptable tradeoff for reliability

This means the preview URLs are only valid after the workflow completes (not immediately on push).

### GitHub Actions workflow

File: `.github/workflows/preview-env.yml`

**The canonical implementation is in the actual workflow file.** The YAML below was the initial spec draft. See the real file for the tested implementation which incorporates all findings below.

**Key differences between this spec draft and the actual implementation:**

| Spec draft | Actual implementation | Why |
|---|---|---|
| `superfly/flyctl-actions@master` | `@1.5` | `@master` is unstable; `@1.6` doesn't exist (D22) |
| Credentials in `$GITHUB_ENV` | Credentials in `$GITHUB_OUTPUT` via step `id: creds` | Better scoping; secrets accessed as `${{ steps.creds.outputs.PG_PASSWORD }}` |
| No `::add-mask::` | All 5 credentials masked before GITHUB_OUTPUT | GH Actions does NOT auto-mask step outputs (D23) |
| Direct TCP health checks (`pg_isready -h $APP_NAME.fly.dev`) | `flyctl proxy` tunnels + `psql` via localhost | Ubuntu psql lacks ALPN for `pg_tls` (D15, D17) |
| Direct TCP migrations (`sslmode=no-verify`) | Proxy tunnel migrations (`sslmode=disable`) | Same ALPN issue |
| Hardcoded admin creds (`admin@example.com` / `adminADMIN!@12`) | Random creds (`openssl rand -hex 12`) | Bypass secret also randomized (D24) |
| Vercel env vars via CLI (`vercel env rm` + `vercel env add`) | REST API `POST /v10/projects/{id}/env?upsert=true` | CLI fails on duplicates during `synchronize` events (D18) |
| `vercel alias set` for custom domains | REST API `POST /v10/projects/{id}/domains` | Direct domain registration, no alias step needed (D19) |
| No `--ha=false` | `fly deploy --ha=false` | Prevents duplicate machines (D20) |
| `flyctl deploy --config .fly/preview.toml` from repo root | `cd .fly && flyctl deploy . --config fly.toml` | Path resolution inconsistency between `[build]` and `[experimental]` (D21) |
| No `permissions` block | `permissions: { contents: read, pull-requests: write }` | Least-privilege (D25) |
| TCP services in fly.toml | TCP services via Machines REST API post-deploy | `fly deploy` doesn't reliably apply TCP services to multi-container (D16) |
| `timeout-minutes: 20` (deploy), `5` (teardown) | `30` (deploy), `15` (teardown) | More headroom for proxy tunnels + migrations |
| Nango, SigNoz, OTEL steps | Not included | Deferred to Stage 1B |

**Deploy job high-level flow (20 steps):**
1. Checkout → 2. Setup flyctl → 3. Generate + mask credentials → 4. Create Fly app → 5. Allocate dedicated IPv4 → 6. Template machine-config.json with secrets → 7. Deploy to Fly (`--ha=false`, from `.fly/` dir) → 8. Configure TCP services via Machines API → 9. Start `flyctl proxy` tunnels (Doltgres, Postgres, SpiceDB) → 10. Wait for DBs healthy via proxy → 11. Setup Node.js + pnpm → 12. Build agents-core/CLI/SDK → 13. Run migrations via proxy → 14. Init auth via proxy → 15. Set agents-api Vercel env vars (REST API) → 16. Set manage-ui Vercel env vars → 17. Add custom preview domains → 18. Trigger Vercel redeploy → 19. Seed test data → 20. Comment on PR

**Teardown job:** Destroy Fly app → Remove preview domains from Vercel projects

### Production safety mechanisms

1. **Env vars are always branch-scoped:** Every `vercel env add` call includes the branch name. Production env vars (no branch scope) are never modified.
2. **Separate infrastructure:** Fly.io is an entirely separate platform from production cloud services. No shared databases, no shared state.
3. **Separate domains:** `pr-{n}-*.preview.inkeep.com` is in a different subdomain tree from `api.agents.inkeep.com`, `app.inkeep.com`, and `pilot.inkeep.com`.
4. **Workflow isolation:** Triggers only on `pull_request` events. Production workflow triggers on `release` events.
5. **Credential isolation:** All credentials are random per PR. No production secrets are used.
6. **Fly app naming:** `pr-{n}-agents` prefix — no collision with any production resources.
7. **Additive only:** Workflow adds new env vars and domain aliases; never modifies or deletes existing ones (except its own on teardown).

### Alternatives considered

| Option | Why not chosen |
|---|---|
| **Railway** | Edge proxy is HTTP/1.1 only — blocks SpiceDB gRPC. No `depends_on` for startup ordering. |
| **GCP (Cloud Run)** | No persistent volumes, single port, no gRPC proxy. GCE requires Terraform for lifecycle. |
| **Render** | $19/user/month platform fee. No docker-compose support, no `depends_on`. |
| **Self-hosted VPS** | Full operational burden (monitoring, security patching, capacity planning). |
| **PullPreview** | 300 EUR/year license. Each PR = 1 VM (expensive at scale). |
| **Raw .vercel.app URLs** | Public suffix — cannot share cookies. End-to-end auth impossible without custom domains. |

See research report for full comparison: `~/.claude/reports/pr-preview-environments/REPORT.md`

## 10) Decision log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence |
|---|---|---|---|---|---|---|
| D1 | Use Fly.io for backend services | T | No | Confirmed | Native gRPC/HTTP2, `depends_on`, docker-compose-like model, multi-container Machines | `evidence/fly-io-architecture.md` |
| D2 | SpiceDB uses memory engine | T | No | Confirmed | CI already uses this pattern. Eliminates 2 containers. | `evidence/current-infra-state.md` |
| D3 | Migrations run from GH Actions runner | T | No | Confirmed | Uses PR branch's migration files. No Docker image build needed. | `evidence/current-infra-state.md` |
| D4 | Branch-scoped Vercel env vars | T | No | Confirmed | Vercel REST API `gitBranch` parameter. Additive, never touches production. | `evidence/current-infra-state.md` |
| D5 | Include all services (Nango, SigNoz, OTEL, Jaeger) | X | No | Confirmed | User wants full parity with local dev. | User decision (session 2) |
| D6 | Custom `*.preview.inkeep.com` domains | T | No | Confirmed | `.vercel.app` is public suffix — cookies can't be shared. `*.preview.inkeep.com` already configured with 60+ projects. CORS + cookies work automatically. | `evidence/vercel-deployment-architecture.md` |
| D7 | Fly.io VM: shared-cpu-8x, 8GB RAM | T | No | Confirmed | 11 running processes need ~6-8GB. Region: iad. | `evidence/optional-services-setup.md` |
| D8 | Fly.io org: inkeep-46 | T | No | Confirmed | Existing org, token generated. | Fly.io dashboard |
| D9 | Config files via Dockerfile | T | No | Confirmed | SigNoz/Nango/OTEL need config files. Dockerfile approach keeps main repo clean. | `evidence/optional-services-setup.md` |
| D10 | Explicit Vercel redeploy after env vars set | T | No | Confirmed | Vercel auto-deploy starts before env vars are ready. Explicit redeploy guarantees correct config. | `evidence/vercel-deployment-architecture.md` |
| D11 | agents-api stays on Vercel, Fly is DB-only | T | No | **Confirmed** | Stage 2 TCP validation proved public TCP routing WORKS — the Stage 1 failure was a config error (missing `services` block + no dedicated IPv4). | `evidence/stage2-tcp-validation.md` |
| D12 | `pg_tls` handler for Postgres, raw TCP `[]` for gRPC | T | No | Confirmed | `pg_tls` handles PostgreSQL STARTTLS. gRPC needs raw passthrough (ALPN incompatible with `tls` handler). | `evidence/stage2-tcp-validation.md` |
| D13 | Custom `preview.inkeep.com` domains from Phase 1 | T | No | Confirmed | Required for cross-service cookies + CORS. `.vercel.app` is a public suffix — cookies blocked. Using deterministic `pr-{n}-api.preview.inkeep.com` / `pr-{n}-ui.preview.inkeep.com`. | Stage 2 auth flow analysis |
| D14 | Dedicated IPv4 per Fly app (~$2/mo) | T | No | Confirmed | Required for raw TCP routing. Shared IPv4 uses SNI (HTTP/TLS only). | `evidence/stage2-tcp-validation.md` |
| D15 | Connection strings: `sslmode=require` for Vercel (Node.js), `sslmode=disable` for proxy tunnels | T | No | **Revised** | `pg_tls` requires ALPN. Node.js `pg` handles ALPN → `sslmode=require` works. Ubuntu `psql` does NOT support ALPN → must use `flyctl proxy` + `sslmode=disable`. Original spec said `sslmode=no-verify` everywhere — corrected. | Stage 2 GH Actions iteration |
| D16 | Services configured via Machines API post-deploy | T | No | Confirmed | `fly deploy` creates Machine from `machine-config.json` (containers). TCP services added via `POST /v1/apps/{app}/machines/{id}`. | `evidence/stage2-tcp-validation.md` |
| D17 | ~~Migrations via direct TCP (no `flyctl proxy`)~~ → Migrations via `flyctl proxy` tunnels | T | No | **Revised** | Direct TCP from Node.js works (Vercel runtime), but GH Actions runners use Ubuntu whose `psql` lacks ALPN support for `pg_tls`. Migrations + health checks from GH runner must use `flyctl proxy` (WireGuard tunnel, localhost, `sslmode=disable`). | Stage 2 GH Actions iteration — "SSL error: no application protocol" |
| D18 | Vercel env vars via REST API with `?upsert=true` | T | No | Confirmed | CLI `vercel env add` fails on duplicates during `synchronize` events. REST API `POST /v10/projects/{id}/env?upsert=true` handles create + update. | Stage 2 Vercel API research |
| D19 | Per-PR domains via Vercel REST API (not wildcard) | T | No | Confirmed | Wildcard domain can only be on one project. Specific subdomains added per-PR per-project via `POST /v10/projects/{id}/domains`. | Stage 2 Vercel domain research |
| D20 | `fly deploy --ha=false` for preview apps | T | No | Confirmed | `fly deploy` creates 2 machines by default (HA). Preview envs need only 1. TCP services configured via Machines API only apply to one machine — traffic could route to the unconfigured one. `--ha=false` prevents this. | Stage 2 GH Actions iteration — duplicate machine debugging |
| D21 | Deploy from `.fly/` dir (`cd .fly && flyctl deploy .`) | T | No | Confirmed | Fly path resolution is inconsistent: `[build].dockerfile` resolves relative to the config file's directory, but `[experimental].machine_config` resolves relative to the deploy context. Deploying from within `.fly/` makes all paths resolve consistently. | Stage 2 GH Actions iteration — "dockerfile '.fly/.fly/Dockerfile' not found" |
| D22 | `flyctl-actions/setup-flyctl@1.5` (not `@master`) | T | No | Confirmed | `@master` is unstable. `@1.6` does not exist as of Feb 2026. `@1.5` is the latest stable tag. | Stage 2 GH Actions iteration — "unable to find version 1.6" |
| D23 | All credentials via `::add-mask::` before `$GITHUB_OUTPUT` | T | No | Confirmed | `${{ steps.*.outputs.* }}` are NOT auto-masked by GH Actions. `sed` commands substituting secrets into config files print plaintext values in logs. Must call `echo "::add-mask::$VALUE"` for every secret before writing to GITHUB_OUTPUT. | Stage 2 GH Actions iteration — secrets visible in workflow logs |
| D24 | Bypass secret must be random (`openssl rand -hex 16`) | T | No | Confirmed | Predictable bypass secrets (e.g., `preview-bypass-{PR_NUM}`) are guessable and allow unauthorized API access to ephemeral preview environments. Use random generation. | Stage 2 PR review feedback |
| D25 | Explicit `permissions` block in workflow | T | No | Confirmed | GH Actions workflows should declare least-privilege permissions (`contents: read`, `pull-requests: write`) rather than relying on default token permissions. | Stage 2 PR review feedback |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Status |
|---|---|---|---|---|---|
| Q5 | Database security for publicly-exposed TCP ports | T | P1 | No | Random passwords per PR. Acceptable for ephemeral preview envs. Could add Fly IP allowlisting later. |
| Q7 | How to handle Nango providers.yaml in Fly containers | T | P1 | No | Bake into Dockerfile or fetch from GitHub during build. See config files strategy. Stage 1B. |
| Q8 | Vercel `env add` CLI — does it support piped input for values? | T | P1 | No | **Resolved (D18):** CLI `vercel env add` fails on duplicates during `synchronize` events. Use REST API `POST /v10/projects/{id}/env?upsert=true` instead. |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Status |
|---|---|---|---|---|
| A1 | Fly.io TCP services expose PostgreSQL wire protocol publicly | ~~MEDIUM~~ **CONFIRMED** | Test with `psql` from external host | **Validated** — Stage 2 TCP validation. `pg_tls` handler works for both Doltgres (5432) and Postgres (5433). Requires dedicated IPv4 + services config. See `evidence/stage2-tcp-validation.md`. |
| A2 | Fly.io multi-container `[[containers]]` syntax works with 11+ containers | MEDIUM | Test with full fly.toml deployment | Validate in Stage 1B (currently validated with 4 containers) |
| A3 | `pnpm db:migrate` works against remote Fly databases | ~~HIGH~~ **CONFIRMED (with caveat)** | Same pattern as CI service containers | **Validated** — works via `flyctl proxy` tunnels with `sslmode=disable`. Does NOT work via direct TCP from Ubuntu GH runners (ALPN issue). Node.js `pg` driver from Vercel serverless works with direct TCP + `sslmode=require`. |
| A5 | SpiceDB gRPC on port 50051 reachable through Fly TCP service | ~~MEDIUM~~ **CONFIRMED** | Test with `grpcurl` | **Validated** — Stage 2 TCP validation. Raw passthrough (`[]` handlers) + `-plaintext` + `SPICEDB_TLS_ENABLED=false`. See `evidence/stage2-tcp-validation.md`. |
| A6 | Per-PR custom domains via Vercel REST API | HIGH | `POST /v10/projects/{id}/domains` to add, `DELETE /v9/projects/{id}/domains/{domain}` to remove | Active — wildcard domain can only be on one project, so specific subdomains added per-PR per-project |
| A7 | SigNoz HTTP API at port 3080 is reachable through Fly HTTP service | HIGH | Standard HTTP service on Fly | Active — Stage 1B |
| A8 | ClickHouse + ZooKeeper + SigNoz stack starts within 5 minutes on shared-cpu-8x | MEDIUM | Local docker-compose takes ~3min; Fly may be slower | Validate in Stage 1B |
| A9 | Nango self-migrates on startup (no external migration step needed) | HIGH | Confirmed from docker-compose behavior — Nango runs its own DB migrations on boot | Active — Stage 1B |

## 13) Phases & rollout plan

### Validation plan (incremental, each step reversible)

**Step 1: Fly.io Machine test** (zero production risk)
- Create a test app manually, deploy full multi-container config
- Verify all 11 services start and are healthy
- Test TCP port connectivity from external host (psql, grpcurl, curl)
- Run migrations from local machine against Fly databases
- Validate assumptions A1, A2, A5, A8
- Destroy test app when done

**Step 2: Vercel branch-scoped env vars test** (isolated to one test branch)
- Create branch `test/preview-env-validation`, open a PR
- Manually set branch-scoped env vars via Vercel CLI
- Verify agents-api preview picks up Fly database URLs
- Verify production env vars are untouched
- Close PR when done

**Step 3: Custom domain alias test**
- On the test PR, alias Vercel preview to `preview-test-api.preview.inkeep.com`
- Verify DNS resolves, HTTPS works, CORS allows requests
- Test cookie-based auth between manage-ui and agents-api previews
- Remove alias when done

**Step 4: Full automation**
- Merge the workflow file, fly.toml, and Dockerfile
- Open a real PR
- Watch end-to-end: Fly deploy → migrations → env vars → redeploy → aliases → PR comment
- Verify manage-ui → agents-api → databases all connected

### Phase 1: Full end-to-end preview environments

- **Goal:** Every PR gets a fully isolated backend on Fly.io with all services. Both agents-api and agents-manage-ui Vercel previews connect to it via custom `*.preview.inkeep.com` domains. Cookie-based auth works. Traces flow to SigNoz. Nango is available for integration testing.
- **In scope:**
  - `.fly/preview.toml` — multi-container machine config (all 15 processes)
  - `.fly/Dockerfile.preview` — config files for SigNoz, Nango, OTEL
  - `.github/workflows/preview-env.yml` — full lifecycle workflow
  - Fly.io org token as GitHub secret (already generated)
  - Vercel env var injection for both projects
  - Custom domain aliases per PR
  - Explicit Vercel redeploy after env vars set
  - PR comment with all preview URLs
  - Teardown on PR close (Fly destroy + domain alias removal)
- **Owner(s)/DRI:** Edwin
- **Acceptance criteria:**
  - [ ] Opening a PR creates a Fly app with all 11 services healthy
  - [ ] Migrations succeed against Fly databases
  - [ ] SigNoz admin + PAT auto-created
  - [ ] Nango accessible and configured
  - [ ] `pr-{n}-api.preview.inkeep.com` serves agents-api connected to Fly databases
  - [ ] `pr-{n}-ui.preview.inkeep.com` serves manage-ui connected to agents-api
  - [ ] Cookie-based auth works (login via manage-ui → session shared with agents-api)
  - [ ] Traces from agents-api appear in SigNoz
  - [ ] Closing the PR destroys Fly app and removes domain aliases
  - [ ] Two concurrent PRs have fully independent environments
  - [ ] Production is unaffected (env vars, domains, Fly resources all isolated)
- **Risks + mitigations:**
  - Fly.io TCP port syntax wrong → validate in Step 1 before merging workflow
  - SigNoz stack too slow to start → increase timeout; monitor startup times
  - 8GB RAM insufficient → upgrade to `performance-2x` (16GB) if needed
  - Migration timeout over internet → increase GH Actions timeout to 20min
  - Vercel redeploy API changes → fallback to CLI-based deploy trigger

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Fly TCP port exposure doesn't work for PostgreSQL | ~~Confirmed~~ **Mitigated** | ~~High~~ None | **Stage 2 validated: TCP WORKS. Stage 1 failure was a config error (missing `services` block + no dedicated IPv4). See D11, D12, D14 and `evidence/stage2-tcp-validation.md`.** |
| Database credentials leaked in GH Actions logs | Medium | Low — ephemeral preview data | `::add-mask::` on all generated credentials. |
| Fly cost overrun from forgotten environments | Low | Low | Teardown on PR close. Add weekly cleanup cron as safety net. |
| SigNoz stack fails to start (ClickHouse resource pressure) | Medium | Medium — no traces but core still works | Make SigNoz setup non-blocking; post degraded status in PR comment. |
| Vercel env var API changes behavior | Low | Medium | Pin Vercel CLI version. Use REST API as fallback. |
| Nango providers.yaml becomes stale in Dockerfile | Low | Low — only affects new integration providers | Update Dockerfile periodically or fetch at build time. |
| Concurrent workflow runs for same PR | Medium | Low | `concurrency` group with `cancel-in-progress: true`. |
| Ubuntu psql lacks ALPN support for `pg_tls` | **Confirmed** | Medium | Use `flyctl proxy` tunnels for all GH runner → Fly DB connections. Connect via localhost with `sslmode=disable`. Vercel (Node.js) unaffected. |
| `fly deploy` creates duplicate HA machines | **Confirmed** | Medium | Use `--ha=false` flag. Without it, TCP services configured on only one machine; traffic may route to the unconfigured one. |
| Destroying Fly app mid-deploy breaks image registry | **Confirmed** | Low | Next deploy gets `MANIFEST_UNKNOWN`. Solution: re-trigger workflow (creates fresh app + image). |
| Fly path resolution inconsistency | **Confirmed** | Low | `[build].dockerfile` resolves relative to config dir; `[experimental].machine_config` resolves relative to deploy context. Solution: deploy from within `.fly/` directory. |

## 15) Stage 1 Validation Results (2026-02-19)

### Summary

End-to-end validated: Fly.io multi-container Machine hosting core DBs (Doltgres, Postgres, SpiceDB), connected via `flyctl proxy` tunnels to a local agents-api instance, with full project seeding and streaming chat completions working.

### What was validated

| Step | Result | Notes |
|---|---|---|
| Fly multi-container deploy | Pass | 4 containers (sidecar, doltgres, postgres, spicedb) sharing localhost |
| Container health checks | Pass | All exec-based health checks passing |
| `flyctl proxy` tunnel access | Pass | All 3 services reachable via private network tunnels |
| Database migrations (manage + run) | Pass | `pnpm db:migrate` applies both Doltgres and Postgres migrations |
| Auth init (SpiceDB schema + org + user) | Pass | `pnpm db:auth:init` creates SpiceDB schema, org `default`, admin user |
| agents-api startup against Fly DBs | Pass | Vite dev server connects to Fly DBs via proxy tunnels |
| Project push (weather-project seeding) | Pass | Via curl to `/manage/tenants/default/project-full/:projectId` with bypass secret |
| API key creation | Pass | Via manage API |
| Chat completions (streaming SSE) | Pass | Full agent execution with streaming response |

### Key findings

1. **~~Public TCP routing broken~~** → **Public TCP routing WORKS** (Stage 2 correction): Stage 1 concluded TCP was broken on multi-container Machines. **Stage 2 proved this was a configuration error**, not a platform limitation. Root cause: (a) no `services` block in `machine-config.json` — Fly Proxy had zero routing instructions, (b) no dedicated IPv4 — raw TCP requires `flyctl ips allocate-v4`. With both fixed, all 4 ports work from the public internet. See `evidence/stage2-tcp-validation.md`.

2. **`flyctl proxy` (private network) works perfectly and IS required for CI**: All services accessible via WireGuard tunnels. **Still needed for GH Actions runners** — Ubuntu's system `psql` does not support the ALPN negotiation required by Fly's `pg_tls` handler ("SSL error: no application protocol"). Direct TCP works from Node.js (Vercel runtime) but not from Ubuntu CLI tools. See D15, D17 revisions.

3. **Doltgres requires 4GB+ RAM**: OOM killed at 2GB RAM shared across 4 containers. Scaled to 4GB (`shared-cpu-4x --memory 4096`) and stable. Cost: ~$0.04/hr ($31/mo if running 24/7, but preview envs are ephemeral).

4. **SpiceDB memory engine works**: No backing Postgres needed. Matches CI pattern from `cypress.yml`.

5. **Bypass secret auth for seeding**: The `inkeep push` CLI uses session tokens from the user's local profile, which are invalid for a fresh agents-api instance. Solution: use the bypass secret (`INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET`) via Bearer auth header in curl requests. Endpoint: `PUT /manage/tenants/:tenantId/project-full/:projectId`.

6. **Proxy tunnels are fragile but necessary for CI**: Background `flyctl proxy` processes die when the parent shell exits. In GH Actions, start them with `&` in a dedicated step — they stay alive across subsequent steps within the same job. They die when the job ends (acceptable — only needed during deploy job).

### Architecture revision based on findings

~~Since public TCP doesn't work with multi-container, the preview environment architecture must change.~~ **Stage 2 update: TCP WORKS. Original architecture is valid — agents-api stays on Vercel, Fly Machine is DB-only.**

**D11: Connectivity approach for Vercel → Fly databases**
- **Decision: agents-api stays on Vercel, Fly is DB-only** (Option C below)
- **Resolved:** Stage 2 TCP validation proved direct TCP works from Vercel serverless to Fly. See `evidence/stage2-tcp-validation.md`.
- Original options considered: (A) Run agents-api on Fly alongside DBs — HTTP only, (B) Separate Fly apps per service, (C) Direct TCP from Vercel to Fly (original architecture, now validated)
- **Why C won:** Simplest architecture. No Docker image build for agents-api. Vercel handles auto-preview. Only TCP exposure + dedicated IPv4 needed.

### Stage 2 TCP Validation Results (2026-02-19)

**All 4 ports validated from the public internet** (see `evidence/stage2-tcp-validation.md` for full test output):

| Port | Service | Handler | Result | Notes |
|------|---------|---------|--------|-------|
| 5432 | Doltgres | `pg_tls` | **PASS** | `psql` and Node.js `pg` module both connect. Use `sslmode=require` (not `prefer`). |
| 5433 | Postgres | `pg_tls` | **PASS** | Same. `sslmode=prefer` (default) fails with `SSL SYSCALL error: EOF detected`. |
| 50051 | SpiceDB gRPC | `[]` (raw) | **PASS** | `grpcurl -plaintext` → SERVING. Must use raw passthrough (ALPN breaks `tls` handler). |
| 8443 | SpiceDB HTTP | `tls` | **PASS** | `curl -k` → SERVING. Standard HTTPS via grpc-gateway REST API. |

**Root cause of Stage 1 failure:** Two missing configuration items — (1) no `services` block telling Fly Proxy how to route, (2) no dedicated IPv4 (shared IPs use SNI, HTTP-only).

**Connection strings validated:**

For Vercel serverless (Node.js `pg` driver — handles ALPN):
```env
INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql://appuser:PASSWORD@pr-N-agents.fly.dev:5432/inkeep_agents?sslmode=require
INKEEP_AGENTS_RUN_DATABASE_URL=postgresql://appuser:PASSWORD@pr-N-agents.fly.dev:5433/inkeep_agents?sslmode=require
SPICEDB_ENDPOINT=pr-N-agents.fly.dev:50051
SPICEDB_PRESHARED_KEY=GENERATED_KEY
SPICEDB_TLS_ENABLED=false
```

For GH Actions runner (via `flyctl proxy` tunnels — Ubuntu psql lacks ALPN):
```env
INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql://appuser:PASSWORD@localhost:5432/inkeep_agents?sslmode=disable
INKEEP_AGENTS_RUN_DATABASE_URL=postgresql://appuser:PASSWORD@localhost:15433/inkeep_agents?sslmode=disable
SPICEDB_ENDPOINT=localhost:50051
SPICEDB_PRESHARED_KEY=GENERATED_KEY
SPICEDB_TLS_ENABLED=false
```

### Fly.io infrastructure state

```
App:         test-preview-agents
Org:         inkeep-46
Region:      iad
Machine:     68349d3b747048 (shared-cpu-4x, 4096MB RAM)
Status:      stopped (manually stopped to avoid costs)

Containers:  sidecar (alpine), doltgres (0.54.10), postgres (18), spicedb (v1.49.1)
Credentials: PG_PASSWORD=67d86cc721c057b31d771d00662c27d1
             SPICEDB_KEY=783a912d099a05df14eda461fe823a19

Proxy ports: 15432→5432 (doltgres), 15433→5433 (postgres), 15051→50051 (spicedb)
```

### Setup sequence (validated)

```bash
# 1. Start machine
flyctl machine start <machine-id> -a test-preview-agents

# 2. Wait for health, then start proxy tunnels
flyctl proxy 15432:5432 -a test-preview-agents &
flyctl proxy 15433:5433 -a test-preview-agents &
flyctl proxy 15051:50051 -a test-preview-agents &

# 3. Run migrations
INKEEP_AGENTS_MANAGE_DATABASE_URL="postgresql://appuser:<pw>@localhost:15432/inkeep_agents" \
INKEEP_AGENTS_RUN_DATABASE_URL="postgresql://appuser:<pw>@localhost:15433/inkeep_agents" \
pnpm db:migrate

# 4. Auth init (SpiceDB schema + org + admin user)
SPICEDB_ENDPOINT="localhost:15051" SPICEDB_PRESHARED_KEY="<key>" \
pnpm db:auth:init

# 5. Start agents-api with Fly DB env vars
INKEEP_AGENTS_MANAGE_DATABASE_URL=... INKEEP_AGENTS_RUN_DATABASE_URL=... \
SPICEDB_ENDPOINT=... SPICEDB_PRESHARED_KEY=... \
INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET="<secret>" \
pnpm --filter agents-api dev

# 6. Seed project data
curl -X PUT "http://localhost:3002/manage/tenants/default/project-full/<project-id>" \
  -H "Authorization: Bearer <bypass-secret>" \
  -H "Content-Type: application/json" \
  -d @project.json
```

### Stage 2 Implementation Status (2026-02-20)

**Implementation location:** `inkeep/inkeep-agents-test` repo, PR #1, branch `feat/pr-preview-environments`
**Worktree:** `/Users/edwingomezcuellar/InkeepDev/agents-preview-env`

| File | Status | Description |
|------|--------|-------------|
| `.github/workflows/preview-env.yml` | Implemented (20-step deploy + teardown) | All fixes from D20-D25 applied. Proxy tunnels implemented. Untested E2E due to main CI blocker. |
| `.github/workflows/preview-cleanup.yml` | Implemented | Weekly cron orphan cleanup. |
| `.fly/fly.toml` | Implemented | Relative paths, `[experimental]` container config. |
| `.fly/machine-config.json` | Implemented | 4 containers (sidecar, doltgres, postgres, spicedb) with health checks. |
| `.fly/Dockerfile` | Implemented | Minimal sidecar (`alpine:3.21`, `sleep infinity`). |

**Commits (8 total on branch):**
1. Initial workflow + Fly config
2. `fix: address PR review feedback` — masking, permissions, pinning, sslmode, bypass secret
3. `fix: use correct flyctl-actions tag (1.5, not 1.6)`
4. `fix: deploy from .fly/ dir so all paths resolve consistently`
5. `fix: add --ha=false to prevent duplicate machines`
6. `fix: show DB health check errors for debugging`
7. `fix: use flyctl proxy tunnels for all GH runner → Fly DB connections`
8. `docs: capture Stage 2 iteration learnings in PROGRESS.md`

**Blocker:** origin/main has CI issues (Dolt-related) that prevent `pnpm db:migrate` from succeeding. The flyctl proxy tunnels approach (commit 7) has not been E2E tested because even if DB connectivity works, the migration step would fail due to upstream code issues. Once main CI is green, re-trigger the workflow on PR #1 to validate.

**What has been validated on Fly:**
- App creation + multi-container deploy: PASS
- TCP services configured via Machines REST API: PASS
- Dedicated IPv4 allocation: PASS
- Machine health checks (Doltgres, Postgres, SpiceDB internal): PASS
- `flyctl proxy` tunnels from macOS: PASS
- Direct TCP from macOS psql: PASS (ALPN works on macOS)
- Direct TCP from Ubuntu GH runner psql: FAIL ("SSL error: no application protocol")

**What has NOT been validated E2E:**
- `flyctl proxy` tunnels from GH Actions runner
- `pnpm db:migrate` via proxy tunnels in CI
- `pnpm db:auth:init` via proxy tunnels in CI
- Vercel env var upsert + redeploy flow
- Custom domain registration + routing
- Project seeding via `inkeep push`
- Full end-to-end: manage-ui → agents-api → Fly DBs

---

## 16) Appendices (documented deferrals)

### Deferral: Auto-stop idle Fly Machines

- **What we learned:** Fly.io supports auto-stop/start based on traffic. Stopped machines cost only volume storage.
- **Why deferred:** Cost optimization can come after the core works. Current estimate (~$106/mo for 10 concurrent PRs) is acceptable.
- **Trigger to revisit:** If monthly Fly.io costs exceed $200 or if long-lived PRs accumulate.
- **Implementation sketch:** Add `auto_stop_machines = true` and `auto_start_machines = true` to fly.toml.

### Deferral: Path-based workflow filtering

- **Why deferred:** User wants all PRs to get preview environments initially.
- **Trigger to revisit:** If workflow runs on docs-only PRs waste significant resources.
- **Implementation sketch:** Add `paths-ignore: ['agents-docs/**', '*.md']` or use `dorny/paths-filter`.

### ~~Deferral~~ Resolved: Running agents-api on Fly.io instead of Vercel

- **What we learned:** Stage 2 validated that TCP works — agents-api stays on Vercel (D11 confirmed).
- **Why resolved:** A1 and A5 both confirmed. Public TCP routing works with dedicated IPv4 + services config. No need for agents-api on Fly.
- **Status:** Closed. The fallback (agents-api on Fly) remains available if security requirements ever mandate no public DB exposure, but there is no current trigger.

### Deferral: Shared SigNoz instance (cost optimization)

- **What we learned:** SigNoz is the heaviest part of the stack (7 processes, ~3GB RAM). Telemetry data from preview envs is useful but not PR-specific — all traces could go to a single shared SigNoz instance.
- **Why deferred:** Per-PR isolation is simpler to implement first. Shared instance adds routing complexity.
- **Trigger to revisit:** If cost is a concern and SigNoz is the primary driver.

### Deferral: Full TLS for Fly.io service ports

- **What we learned:** Database connections from Vercel → Fly use `pg_tls` handler (STARTTLS, auto-generated certs, `sslmode=require`). SpiceDB gRPC uses raw TCP passthrough (no TLS, `-plaintext`). SigNoz/Nango/OTEL (Stage 1B) would use HTTP.
- **Current state:** Postgres connections ARE encrypted via `pg_tls`. SpiceDB gRPC is unencrypted. Acceptable for ephemeral dev environments with random credentials.
- **Why deferred:** SpiceDB gRPC doesn't work with Fly's `tls` handler (ALPN incompatibility). Would need a TLS-terminating sidecar.
- **Trigger to revisit:** If security audit flags unencrypted SpiceDB connections in preview envs.
