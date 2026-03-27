# Preview Environment Auth — Spec

**Status:** Draft
**Owner(s):** andrew
**Last updated:** 2026-03-19

---

## 1) Problem statement
- **Who is affected:** Any developer trying to use a preview deployment to test the Manage UI or API.
- **What pain / job-to-be-done:** Preview environments deployed by the `preview-environments.yml` workflow cannot be logged into. The Manage UI login form is rendered but authentication always fails because the required auth infrastructure is never initialized.
- **Why now:** Preview environments are being stood up for PR review; login is the first thing a reviewer tries and it doesn't work.
- **Current workaround(s):** None. Reviewers must check out the branch and run locally.

## 2) Goals
- **G1:** A reviewer can open the preview UI URL, log in with shared credentials, and interact with the Manage UI.
- **G2:** The API preview deployment can sign and validate session tokens (Better Auth functional).
- **G3:** SpiceDB authorization checks succeed (preshared key configured, schema written, org/user seeded).
- **G4:** Database schema is up-to-date with the PR branch (migrations applied).

## 3) Non-goals
- **NG1:** Per-user accounts or SSO on preview environments (shared credentials are sufficient behind Vercel deployment protection).
- **NG2:** Production-grade secret rotation or unique secrets per PR (previews are ephemeral and access-protected).
- **NG3:** Running the full test suite against the preview environment.

## 4) Current state (what happens today)

### What the workflow provisions
The `preview-environments.yml` workflow does the following on PR open/sync:

1. **`provision-tier1`** — Creates a Railway environment copied from the template. Extracts three resolved runtime vars:
   - `INKEEP_AGENTS_MANAGE_DATABASE_URL` (Doltgres)
   - `INKEEP_AGENTS_RUN_DATABASE_URL` (Postgres)
   - `SPICEDB_ENDPOINT`

2. **`configure-vercel-preview`** — Injects env vars into Vercel preview deployments via `upsert-vercel-preview-env.sh`, then triggers `vercel deploy` + alias.

3. **`smoke-preview`** — Hits health-check URLs to verify the deployment came up.

### Three gaps preventing login

| Gap | What's missing | Effect |
|-----|----------------|--------|
| **Auth env vars not injected** | `upsert-vercel-preview-env.sh` does not set `BETTER_AUTH_SECRET`, `SPICEDB_PRESHARED_KEY`, `INKEEP_AGENTS_MANAGE_UI_USERNAME`, or `INKEEP_AGENTS_MANAGE_UI_PASSWORD` on the Vercel API project | Better Auth cannot sign tokens → login 500s. SpiceDB client cannot authenticate → authz checks fail. UI auto-login has no credentials. |
| **No DB migrations** | No step runs `db:migrate` against the Railway databases | If the PR branch adds new migration files, the Railway DBs (copied from the template) are missing those tables/columns → runtime errors |
| **No admin user seeded** | No step runs `db:auth:init` | The runtime DB has no user row, no organization, and SpiceDB has no schema or relationships → no one can log in, authz denies everything |

### Evidence: env vars the deploy script checks but are absent

The `deploy-vercel-preview.sh` script already debugs these keys in the step summary, confirming they are expected but not set:

```
debug_key "INKEEP_AGENTS_MANAGE_UI_USERNAME"   # ← not upserted
debug_key "INKEEP_AGENTS_MANAGE_UI_PASSWORD"   # ← not upserted
debug_key "BETTER_AUTH_SECRET"                  # ← not upserted
debug_key "SPICEDB_PRESHARED_KEY"              # ← not upserted
```

### Reference: how CI solves this

`ci.yml` uses hardcoded values for these vars (lines 382-385):

```yaml
INKEEP_AGENTS_MANAGE_UI_USERNAME: admin@example.com
INKEEP_AGENTS_MANAGE_UI_PASSWORD: adminADMIN!@12
BETTER_AUTH_SECRET: test-secret-key-for-ci
SPICEDB_PRESHARED_KEY: dev-secret-key
```

## 5) Proposed solution

### 5a) Inject auth env vars into Vercel preview deployments

**File:** `.github/scripts/preview/upsert-vercel-preview-env.sh`

Add these `upsert_env` calls for the **API project** (`VERCEL_API_PROJECT_ID`):

| Key | Value | Rationale |
|-----|-------|-----------|
| `BETTER_AUTH_SECRET` | `preview-auth-secret-<generated-or-fixed>` | Required for Better Auth token signing. A fixed value is acceptable — previews are behind Vercel deployment protection. |
| `SPICEDB_PRESHARED_KEY` | Extracted from Railway template env, or hardcoded `dev-secret-key` if Railway SpiceDB uses the default | Required for the API to authenticate with SpiceDB. Must match what SpiceDB is configured with in the Railway environment. |
| `INKEEP_AGENTS_MANAGE_UI_USERNAME` | `admin@example.com` | Shared preview admin email. Same as CI and `.env.example`. |
| `INKEEP_AGENTS_MANAGE_UI_PASSWORD` | `adminADMIN!@12` | Shared preview admin password. Same as CI and `.env.example`. |

For the **UI project** (`VERCEL_MANAGE_UI_PROJECT_ID`):

| Key | Value | Rationale |
|-----|-------|-----------|
| `INKEEP_AGENTS_MANAGE_UI_USERNAME` | `admin@example.com` | Used by the UI for dev auto-login |
| `INKEEP_AGENTS_MANAGE_UI_PASSWORD` | `adminADMIN!@12` | Used by the UI for dev auto-login |

**SpiceDB preshared key resolution:** The Railway template environment's SpiceDB service is configured with `SPICEDB_GRPC_PRESHARED_KEY`. This value needs to match what the API sends. Two options:
- **Option A (simple):** Hardcode `dev-secret-key` — this matches all Docker Compose configs and CI. Works if the Railway template uses the same default.
- **Option B (robust):** Extract `SPICEDB_PRESHARED_KEY` from the Railway template environment's service variables (similar to how `SPICEDB_ENDPOINT` is extracted in `provision-railway.sh`). Add it as a new output from the `provision-tier1` job.

Recommend **Option A** initially, with a note in the workflow comments that if the Railway template uses a custom preshared key, this must be updated.

### 5b) Add a new workflow job: `init-preview-db`

A new job that runs **after `provision-tier1`** and **before `configure-vercel-preview`** (or in parallel with it, since they don't depend on each other — but init must complete before `smoke-preview`).

**Purpose:** Run DB migrations and seed the admin user against the Railway-provisioned databases.

**Steps:**

1. Checkout code (at PR head SHA)
2. Setup Node.js 22.x
3. Setup pnpm 10.10.0
4. Install dependencies (`pnpm install --frozen-lockfile`)
5. Run DB migrations: `pnpm db:migrate`
6. Run auth init: `pnpm db:auth:init`

**Environment variables needed:**

```yaml
INKEEP_AGENTS_MANAGE_DATABASE_URL: ${{ needs.provision-tier1.outputs.manage_db_url }}
INKEEP_AGENTS_RUN_DATABASE_URL: ${{ needs.provision-tier1.outputs.run_db_url }}
SPICEDB_ENDPOINT: ${{ needs.provision-tier1.outputs.spicedb_endpoint }}
SPICEDB_PRESHARED_KEY: dev-secret-key
BETTER_AUTH_SECRET: preview-auth-secret
INKEEP_AGENTS_MANAGE_UI_USERNAME: admin@example.com
INKEEP_AGENTS_MANAGE_UI_PASSWORD: adminADMIN!@12
TENANT_ID: default
```

**Runtime:** `db:auth:init` uses `tsx` (transpiles on the fly), so no build step is needed beyond `pnpm install`. `db:migrate` uses `drizzle-kit` which also requires no pre-build.

**Estimated time added:** ~3-4 minutes (pnpm install ~2 min with cache, migrations ~30s, auth init ~30s).

### 5c) Workflow job dependency graph (updated)

```
compute-context
  ├── preview-disabled (if not enabled)
  ├── provision-tier1
  │     ├── init-preview-db        ← NEW
  │     └── configure-vercel-preview
  │           └── smoke-preview (depends on both init-preview-db + configure-vercel-preview)
  └── teardown-tier1 (on PR close)
```

`smoke-preview` should depend on `init-preview-db` in addition to `configure-vercel-preview`, since the smoke test may hit endpoints that require a seeded database.

### 5d) Optional: extract init into a reusable script

Create `.github/scripts/preview/init-preview-db.sh` that:
1. Runs `pnpm db:migrate` with the Railway connection strings
2. Runs `pnpm db:auth:init` with the auth env vars
3. Emits a step summary confirming success

This keeps the workflow YAML clean and follows the pattern of the other preview scripts.

## 6) Alternatives considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: CI job runs migrations + auth init (proposed)** | Explicit, runs against fresh Railway DBs, uses existing `db:migrate` + `db:auth:init` scripts | Adds ~3-4 min to workflow; requires pnpm install | **Selected** — most reliable, matches CI pattern |
| **B: API auto-initializes on first request** | No extra CI job; self-healing | Requires code changes to API startup; race conditions with concurrent requests; mixes runtime concerns with deployment concerns | Rejected — too invasive for this problem |
| **C: Bake migrations + seed into Railway template** | Zero CI overhead | Template drift — every schema change requires manual template update; doesn't handle PR-specific migrations | Rejected — defeats the purpose of per-PR environments |
| **D: Run init as part of Vercel build command** | No extra CI job | Vercel build has no access to Railway DB URLs at build time (they're runtime env vars); Vercel build environment may not have all dependencies | Rejected — infeasible |

## 7) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria |
|----------|-------------|---------------------|
| Must | `BETTER_AUTH_SECRET` injected into Vercel API preview env | `deploy-vercel-preview.sh` debug output shows `BETTER_AUTH_SECRET: present` |
| Must | `SPICEDB_PRESHARED_KEY` injected into Vercel API preview env | Debug output shows `SPICEDB_PRESHARED_KEY: present` |
| Must | Admin credentials injected into both Vercel projects | Debug output shows `INKEEP_AGENTS_MANAGE_UI_USERNAME: present` and `INKEEP_AGENTS_MANAGE_UI_PASSWORD: present` |
| Must | DB migrations run against Railway databases before smoke test | `init-preview-db` job succeeds; `db:migrate` exit code 0 |
| Must | Admin user seeded in runtime DB + SpiceDB | `db:auth:init` exit code 0; smoke test can hit `/ready` endpoint |
| Should | `smoke-preview` job depends on `init-preview-db` | Workflow YAML `needs` includes `init-preview-db` |
| Should | pnpm install uses cache for speed | `actions/cache` or pnpm store cache to reduce install time |

### Non-functional requirements
- **Performance:** New job should complete in <5 minutes.
- **Reliability:** If `init-preview-db` fails, the workflow should still report the failure clearly (not silently skip).
- **Security:** Hardcoded credentials are acceptable because preview deployments are behind Vercel deployment protection. No secrets are logged (use `mask_env_vars`).

## 8) Files to modify

| File | Change |
|------|--------|
| `.github/scripts/preview/upsert-vercel-preview-env.sh` | Add `upsert_env` calls for `BETTER_AUTH_SECRET`, `SPICEDB_PRESHARED_KEY`, `INKEEP_AGENTS_MANAGE_UI_USERNAME`, `INKEEP_AGENTS_MANAGE_UI_PASSWORD` |
| `.github/scripts/preview/init-preview-db.sh` | **New file.** Runs `pnpm db:migrate` + `pnpm db:auth:init`, emits step summary. |
| `.github/workflows/preview-environments.yml` | Add `init-preview-db` job; update `smoke-preview` `needs` to include it |

## 9) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Railway DBs not network-accessible from GitHub Actions runner | Low | High — migrations fail | Railway template env should expose DBs publicly (same as how Vercel serverless connects). Verify in first test run. |
| SpiceDB preshared key mismatch between hardcoded value and Railway config | Medium | High — authz fails silently | Document that `SPICEDB_PRESHARED_KEY` must match Railway template's `SPICEDB_GRPC_PRESHARED_KEY`. Consider extracting from Railway as a follow-up. |
| `pnpm install` is slow without cache | Medium | Low — adds ~2 min | Use `actions/cache` with pnpm store path |
| Railway DB not ready when `init-preview-db` starts | Low | Medium — transient migration failure | `provision-tier1` already waits for runtime vars to resolve (services healthy). Add a brief health check `SELECT 1` before migrating. |

## 10) Decision log

| ID | Decision | Status | Rationale |
|----|----------|--------|-----------|
| D1 | Use shared hardcoded credentials (`admin@example.com` / `adminADMIN!@12`) | Confirmed | Previews are behind Vercel deployment protection; matches CI and `.env.example` defaults |
| D2 | Hardcode `SPICEDB_PRESHARED_KEY=dev-secret-key` initially | Proposed | Matches all Docker Compose configs and CI. If Railway template differs, can extract later. |
| D3 | Use a fixed `BETTER_AUTH_SECRET` for all previews | Proposed | No need for unique secrets — previews are ephemeral and access-protected |
| D4 | Run migrations + auth init as a separate CI job (not in Vercel build) | Confirmed | Vercel build doesn't have DB access at build time; CI job is explicit and debuggable |

## 11) Open questions

| ID | Question | Priority | Blocking? | Status |
|----|----------|----------|-----------|--------|
| Q1 | Does the Railway template environment's SpiceDB use `dev-secret-key` or a custom preshared key? | P1 | Yes — determines whether D2 is correct | Open |
| Q2 | Are Railway-provisioned databases network-accessible from GitHub Actions runners? | P1 | Yes — determines feasibility of the CI job approach | Open |
| Q3 | Should `init-preview-db` run in parallel with `configure-vercel-preview` or sequentially before it? | P2 | No | Open — parallel saves time but adds complexity to the dependency graph |
