# SPEC: Consolidate Optional Local Dev Services into Monorepo

## 1. Problem Statement

Optional local dev services (Nango, SigNoz, OTEL Collector, Jaeger) currently live in a separate companion repo (`inkeep/agents-optional-local-dev`). A bootstrap shim (`scripts/setup-optional.sh`) in the monorepo clones this companion repo into `.optional-services/` on demand and delegates to its `scripts/setup.sh` (352 lines of credential automation and Docker lifecycle management). The same shim is auto-synced to `create-agents-template/scripts/setup-optional.sh` via lint-staged.

This two-repo architecture (established in recently-merged PRs #2052 and #8) creates coordination overhead (paired PRs, sync issues, merge conflicts across repos) without meaningful benefit — licensing research confirmed there's no legal barrier to inlining, and the companion repo's configs are small (~3.3MB).

**Goal:** Fully eliminate the companion repo by moving all optional service configs, Docker Compose definitions, and setup automation directly into the monorepo (and by extension, the `create-agents-template`). Every surface — scripts, docs, deployment guides, gitignore, AI tooling configs — must be updated. The companion repo is archived. No references to `agents-optional-local-dev` or `.optional-services/` remain anywhere in the monorepo. User-facing commands remain identical.

**Starting point:** The current merged state on `main` has:
- Monorepo: `scripts/setup-optional.sh` (57-line shim), `.gitignore` entry for `.optional-services/`, docs referencing the companion repo, lint-staged syncing the shim to the template
- Companion repo: `scripts/setup.sh` (352 lines), `docker-compose.yml`, config dirs (`nango/`, `signoz/`, `otel-collector/`), `.env.docker.example`, LICENSE, README, `nango-instructions.md`
- Template: `create-agents-template/scripts/setup-optional.sh` (identical shim), `.gitignore` entry for `.optional-services/`

## 2. Consumers

| Consumer | Current Experience | Target Experience |
|---|---|---|
| Monorepo contributor | `pnpm setup-dev:optional` clones companion repo, starts services | `pnpm setup-dev:optional` starts services (no clone) |
| Quickstart template user | Same commands, same clone behavior | Same commands, no clone needed — configs already in project |
| Self-hosted deployer | `git clone agents-optional-local-dev inkeep-external-services` | Copy `optional-services/` from monorepo (see §7.5) |
| Existing user with `.optional-services/` | Works via cloned companion repo | Graceful migration (see §8) |

## 3. Constraints

- **C1:** All four pnpm commands preserved: `setup-dev:optional`, `optional:stop`, `optional:status`, `optional:reset`
- **C2:** No change to the 9 env vars written to `.env`
- **C3:** Docker service names, ports, and volumes may change (acceptable — local dev only)
- **C4:** Template auto-sync must work (lint-staged or equivalent)
- **C5:** Core services (`docker-compose.dbs.yml`) remain unaffected
- **C6:** Zero references to `agents-optional-local-dev` or `.optional-services/` remain in monorepo after consolidation

## 4. Requirements

### P0 (Must have)

- **R1:** `optional-services/` directory in monorepo root containing: `docker-compose.yml`, config directories (`nango/`, `signoz/`, `otel-collector/`), `.env.docker.example`
- **R2:** `scripts/setup-optional.sh` absorbs all logic from companion's `setup.sh` — no delegation, no clone
- **R3:** Identical `optional-services/` directory in `create-agents-template/`
- **R4:** lint-staged sync for `optional-services/` directory and `scripts/setup-optional.sh`
- **R5:** ALL documentation updated — every reference to the companion repo and `.optional-services/` removed or replaced (see §7 for complete inventory)
- **R6:** `.gitignore` updated in both monorepo and template — remove `.optional-services/`, add `optional-services/.env`
- **R7:** Companion repo archived with redirect README
- **R8:** Migration handling for users with existing `.optional-services/` clone

### P2 (Nice to have)

- **R9:** Merge `docker-compose.optional.yml` into `docker-compose.dbs.yml` as a single unified compose file with profiles (deferred — evaluate after Phase 1)

## 5. Non-Goals

- Changing which services are included (Nango, SigNoz, OTEL Collector, Jaeger)
- Changing Docker image versions
- Modifying the credential automation logic
- Adding new pnpm commands
- Merging core and optional Docker Compose files (P2 deferral)

## 6. Technical Design

### 6.1 File Layout

```
agents/                                    (monorepo root)
├── optional-services/                     NEW — moved from companion repo
│   ├── docker-compose.yml                 as-is from companion
│   ├── .env.docker.example                as-is from companion
│   ├── nango/
│   │   └── providers.yaml                 as-is (563KB)
│   ├── signoz/
│   │   ├── clickhouse/                    as-is (cluster.xml, config.xml, etc.)
│   │   ├── signoz/                        as-is (otel-collector-opamp-config.yaml, prometheus.yml)
│   │   ├── otel-collector-config.yaml     as-is
│   │   └── README.md                      as-is
│   └── otel-collector/
│       └── otel-collector-config.yaml     as-is
├── scripts/
│   └── setup-optional.sh                  REWRITTEN — full logic, no shim
├── create-agents-template/
│   ├── optional-services/                 SYNCED — mirror of root optional-services/
│   └── scripts/
│       └── setup-optional.sh              SYNCED — mirror of root script
```

### 6.2 Script Consolidation

`scripts/setup-optional.sh` absorbs the companion's `setup.sh`. Key changes:

**Path resolution (before):**
```bash
# Shim: clone companion, then delegate
COMPANION_DIR="${OPTIONAL_SERVICES_DIR:-$REPO_ROOT/.optional-services}"
git clone ... "$COMPANION_DIR"
exec bash "$COMPANION_DIR/scripts/setup.sh" "$@"
```

**Path resolution (after):**
```bash
# Direct: configs are in the repo
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICES_DIR="$REPO_ROOT/optional-services"
ENV_FILE="$REPO_ROOT/.env"
```

**What's removed:**
- Git clone/pull logic
- `OPTIONAL_SERVICES_DIR` override
- `--no-update` flag (no repo to update)
- `COMPANION_DIR` / `CALLER_ENV_FILE` export interface

**What's preserved (copied from companion setup.sh):**
- Docker Compose invocation with all 4 profiles
- `set_env_var()` function (atomic env var writing)
- `wait_for_http()` function (health check polling)
- `get_env_var()` function (dotenv reading)
- Nango credential flow (encryption key + UUID v4 secret key generation)
- SigNoz credential flow (admin registration + PAT creation)
- 9 env vars written to `.env`
- 3 env vars written to `optional-services/.env`
- `--stop`, `--status`, `--reset` subcommands
- Pre-flight checks (Docker running, .env exists)
- Error handling and timeout logic

**Docker Compose path change:**
```bash
# Before (in companion setup.sh):
docker compose -f "$COMPANION_DIR/docker-compose.yml" ...

# After:
docker compose -f "$SERVICES_DIR/docker-compose.yml" ...
```

### 6.3 Template Sync

**Mechanism:** lint-staged with rsync for directory sync.

```json
"lint-staged": {
  "scripts/setup-optional.sh": [
    "bash -c 'cp scripts/setup-optional.sh create-agents-template/scripts/setup-optional.sh && git add create-agents-template/scripts/setup-optional.sh'"
  ],
  "scripts/generate-jwt-keys.sh": [
    "bash -c 'cp scripts/generate-jwt-keys.sh create-agents-template/scripts/generate-jwt-keys.sh && git add create-agents-template/scripts/generate-jwt-keys.sh'"
  ],
  "optional-services/**/*": [
    "bash -c 'rsync -a --delete optional-services/ create-agents-template/optional-services/ && git add create-agents-template/optional-services/'"
  ]
}
```

**How it works:**
1. Developer edits a file in `optional-services/`
2. Developer stages the change
3. Pre-commit hook triggers lint-staged
4. lint-staged matches the `optional-services/**/*` glob
5. rsync copies the entire directory to `create-agents-template/optional-services/`
6. `git add` stages the synced copy
7. Commit includes both source and template copy

**Edge cases:**
- File deletion: `rsync --delete` handles this (removes files from template that don't exist in source)
- New files: rsync copies them automatically
- Binary files: rsync handles these (e.g., `signoz/clickhouse/user_scripts/histogramQuantile`)

### 6.4 .gitignore Changes

**Monorepo `.gitignore` — Remove:**
```
# Optional local dev services (cloned by pnpm setup-dev:optional)
.optional-services/
```

**Monorepo `.gitignore` — Add:**
```
# Generated env for optional Docker services (created by pnpm setup-dev:optional)
optional-services/.env
```

**Template `create-agents-template/.gitignore` — Same changes:** Remove `.optional-services/`, add `optional-services/.env`.

The `optional-services/` directory is now committed (it contains configs). Only the generated `.env` inside it is ignored.

### 6.5 Docker Compose Architecture

**Decision: Keep separate files.** Do NOT merge core and optional compose files.

- `docker-compose.dbs.yml` — core databases (unchanged)
- `optional-services/docker-compose.yml` — optional services (moved from companion)

**Rationale:**
- `docker compose ps` stays clean for core services
- No risk of accidentally starting optional services
- Network isolation preserved (optional services have their own networks)
- The optional compose file's relative volume mounts (`./nango/`, `./signoz/`) work correctly when the compose file is inside `optional-services/`

### 6.6 Package.json Scripts

**No changes needed.** All four scripts already point to `scripts/setup-optional.sh`:
```json
"setup-dev:optional": "sh scripts/setup-optional.sh",
"optional:stop": "sh scripts/setup-optional.sh --stop",
"optional:status": "sh scripts/setup-optional.sh --status",
"optional:reset": "sh scripts/setup-optional.sh --reset"
```

Same in `create-agents-template/package.json`.

## 7. Surface Area Inventory — Complete Change List

Every file that references the companion repo, `.optional-services/`, or the clone/delegate shim architecture. Organized by category.

### 7.1 Scripts (REWRITE)

| # | File | Lines | Current | Change |
|---|------|-------|---------|--------|
| 1 | `scripts/setup-optional.sh` | 1-57 | Bootstrap shim: clones companion, delegates | **Rewrite entirely** — absorb companion's `setup.sh` logic |
| 2 | `create-agents-template/scripts/setup-optional.sh` | 1-57 | Identical shim copy | **Synced** — mirrors rewritten monorepo script |

### 7.2 Config Files (UPDATE)

| # | File | Lines | Current | Change |
|---|------|-------|---------|--------|
| 3 | `.gitignore` | 56-57 | `.optional-services/` entry | **Remove** `.optional-services/`, **add** `optional-services/.env` |
| 4 | `create-agents-template/.gitignore` | 42-43 | `.optional-services/` entry | **Same** as #3 |
| 5 | `package.json` (lint-staged) | 120-122 | Syncs `setup-optional.sh` only | **Add** `optional-services/**/*` rsync rule |
| 6 | `.env.example` | 46 | Comment references `pnpm setup-dev:optional` | **No change** — references command, not companion repo |

### 7.3 Local Dev Documentation (UPDATE)

| # | File | Lines | Current | Change |
|---|------|-------|---------|--------|
| 7 | `agents-docs/content/get-started/traces.mdx` | 100 | "Clones `agents-optional-local-dev` into `.optional-services/`" | **Replace** with "Starts services from `optional-services/`" |
| 8 | `agents-docs/content/get-started/traces.mdx` | 128-134 | Clone + cd instructions for manual setup | **Remove** clone step, replace with "The configs are already in `optional-services/`" |
| 9 | `agents-docs/content/typescript-sdk/credentials/nango.mdx` | 50 | "Clones `agents-optional-local-dev` into `.optional-services/`" | **Replace** with "Starts services from `optional-services/`" |
| 10 | `agents-docs/content/typescript-sdk/credentials/nango.mdx` | 71-75, 78, 99, 112 | Clone instructions, `.optional-services/` references | **Replace** all `.optional-services/` → `optional-services/`, remove clone step |
| 11 | `agents-docs/content/community/contributing/overview.mdx` | 109 | "clones `agents-optional-local-dev` into `.optional-services/`" | **Replace** with "starts services from `optional-services/`" |
| 12 | `agents-docs/_snippets/setup-dev-optional-prereq.mdx` | all | References `pnpm setup-dev` | **No change** — no companion ref |
| 13 | `agents-docs/_snippets/setup-dev-optional-lifecycle.mdx` | all | References lifecycle commands | **No change** — no companion ref |

### 7.4 Contributing / Environment Docs (CHECK)

| # | File | Lines | Current | Change |
|---|------|-------|---------|--------|
| 14 | `agents-docs/content/community/contributing/environment-configuration.mdx` | — | May reference optional services setup | **Check and update** if references companion repo |

### 7.5 Deployment Documentation (UPDATE)

These 5 files tell self-hosted deployers to `git clone agents-optional-local-dev inkeep-external-services`. After archiving the companion repo, these must be updated.

| # | File | Line | Current | Change |
|---|------|------|---------|--------|
| 15 | `agents-docs/content/deployment/(docker)/docker-local.mdx` | 16 | `git clone ...agents-optional-local-dev inkeep-external-services` | **Replace** — copy from monorepo's `optional-services/` |
| 16 | `agents-docs/content/deployment/(docker)/hetzner.mdx` | 44 | Same clone command | **Replace** — same approach |
| 17 | `agents-docs/content/deployment/(docker)/gcp-compute-engine.mdx` | 55 | Same clone command | **Replace** — same approach |
| 18 | `agents-docs/content/deployment/(docker)/aws-ec2.mdx` | 39 | Same clone command | **Replace** — same approach |
| 19 | `agents-docs/content/deployment/(docker)/azure-vm.mdx` | 65 | Same clone command | **Replace** — same approach |

**Deployment docs update approach:** Replace companion repo clone with instructions to copy `optional-services/` from the monorepo. For self-hosted users who already have the monorepo cloned, this is `cp -r optional-services/ /path/to/deploy/inkeep-external-services`. For users deploying from scratch, they clone the monorepo and use the `optional-services/` directory.

### 7.6 AI Tooling / Internal Configs (CHECK)

| # | File | Lines | Current | Change |
|---|------|-------|---------|--------|
| 20 | `AGENTS.md` | 11-12 | References `pnpm setup-dev:optional` and lifecycle commands | **No change** — references commands, not companion repo |
| 21 | `.claude/specs/unified-setup-dev.md` | 179 | Mentions template setup-optional scripts | **Update** to reflect consolidation |

### 7.7 Surfaces Confirmed Clean (no changes needed)

- Runtime code: `agents-api/`, `packages/agents-core/`, `packages/agents-sdk/`, all other packages
- CLI: `agents-cli/`
- UI: `agents-manage-ui/`
- Cookbook: `agents-cookbook/`
- `packages/create-agents/src/utils.ts` — template URL unchanged, content changes transitively
- CI workflows: `.github/workflows/ci.yml`, `cypress.yml`, `release.yml` — no companion references
- `turbo.json`, `pnpm-workspace.yaml` — no companion references
- Core Docker Compose files: `docker-compose.yml`, `docker-compose.dbs.yml` — no companion references

## 8. Migration Path

### Existing users with `.optional-services/` (cloned companion repo)

**Scenario:** A developer already ran the old `pnpm setup-dev:optional` which cloned the companion repo to `.optional-services/`.

**What happens after this change:**
- The new `setup-optional.sh` uses `optional-services/` (committed directory), not `.optional-services/` (cloned directory)
- The old `.optional-services/` directory becomes inert — Docker volumes persist under the old project name
- Running `pnpm setup-dev:optional` creates new containers under the new project name

**Migration guidance (in PR description + docs):**
1. Stop old services: `docker compose -f .optional-services/docker-compose.yml --profile nango --profile signoz --profile otel-collector --profile jaeger down`
2. Optionally remove old volumes: `docker compose -f .optional-services/docker-compose.yml --profile nango --profile signoz --profile otel-collector --profile jaeger down -v`
3. Delete `.optional-services/` directory
4. Run `pnpm setup-dev:optional` to start services from the new location

**Note:** This is a one-time migration for a small audience (monorepo contributors who already set up optional services).

## 9. Companion Repo Disposition

1. **Archive** `inkeep/agents-optional-local-dev` on GitHub (make read-only)
2. **Update README** to say: "This repository has been archived. Optional service configs now live directly in the [agents monorepo](https://github.com/inkeep/agents) under `optional-services/`."
3. **Do not delete** — existing git history should remain accessible

## 10. Decision Log

| # | Decision | Status | Rationale |
|---|---|---|---|
| D1 | Keep optional compose file separate from core compose | CONFIRMED | Clean `docker compose ps`, no accidental starts, preserved network isolation |
| D2 | Place configs at `optional-services/` (root level) | CONFIRMED | Top-level concern, not a script subdirectory |
| D3 | Use rsync in lint-staged for directory sync | PENDING | Best option given lint-staged's file-level matching; needs validation |
| D4 | Drop `OPTIONAL_SERVICES_DIR` env var override | PENDING | No longer needed (no clone), but may be useful for custom locations |
| D5 | Drop `--no-update` flag | CONFIRMED | No external repo to update |
| D6 | Archive (not delete) companion repo | CONFIRMED | Preserves history |
| D7 | Update ALL docs including deployment guides | CONFIRMED | User requirement — total archive, no lingering references |
| D8 | This is new work on a fresh branch | CONFIRMED | PRs #2052 and #8 are merged; consolidation builds on current main |

## 11. Open Questions

1. **[Technical, P1, non-blocking] Should `OPTIONAL_SERVICES_DIR` override be preserved?**
   - Without it: simpler script, configs always at `$REPO_ROOT/optional-services/`
   - With it: allows pointing to an alternate location (custom Docker setup)
   - Investigation: No evidence of anyone using this override in practice (it was added as future-proofing)
   - Recommendation: Drop it. If needed later, it's a 2-line addition.

2. **[Technical, P1, non-blocking] Template size increase (~3.3MB) — acceptable?**
   - `nango/providers.yaml` is 563KB
   - SigNoz configs (XML) add ~65KB
   - The template already includes `pnpm-lock.yaml` (~500KB+), full Next.js app, Docker Compose, Dockerfiles
   - Recommendation: Acceptable. The configs are essential for the optional services to work — they're not bloat.

3. **[Technical, P0, blocks Phase 1] Does rsync work reliably in lint-staged across macOS and Linux?**
   - macOS: rsync comes pre-installed (Apple's fork)
   - Linux: rsync is standard on all major distros
   - CI: GitHub Actions runners have rsync
   - Risk: Behavioral differences between macOS rsync (2.x) and Linux rsync (3.x) for edge cases
   - Mitigation: Test on both; the usage here is simple (`rsync -a --delete`) which is identical across versions
   - Alternative if rsync is problematic: use `cp -R` + manual deletion of stale files

4. **[RESOLVED — PRs merged] Impact on active PRs?**
   - PR #2052 and PR #8 are now merged to `main`. The consolidation is new work on a fresh branch.

5. **[Cross-cutting, P1] Deployment docs approach for self-hosted users**
   - After archiving the companion repo, self-hosted deployers need a new way to get the optional services configs
   - The configs will live in the monorepo under `optional-services/`
   - Deployers who clone the monorepo already have them
   - Deployers who only want the Docker configs can copy the directory or clone with sparse checkout
   - Recommendation: Update deployment docs to reference `optional-services/` in the monorepo, with copy instructions for standalone deployment

## 12. Assumptions

| # | Assumption | Confidence | Verification Plan |
|---|---|---|---|
| A1 | Docker Compose relative volume mounts work when compose file is inside `optional-services/` | HIGH | Test: `docker compose -f optional-services/docker-compose.yml up` — mounts resolve relative to compose file location |
| A2 | lint-staged `optional-services/**/*` glob catches all file types including XML and binary | MEDIUM | Test: stage a change to an XML file, verify lint-staged triggers |
| A3 | rsync `--delete` in lint-staged won't accidentally delete template files outside `optional-services/` | HIGH | rsync target is scoped to `create-agents-template/optional-services/` |

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| lint-staged glob doesn't match deeply nested files | LOW | Configs drift between monorepo and template | Test with actual nested file changes; add CI check |
| Docker volume name change breaks existing optional services data | MEDIUM | Users lose SigNoz traces and Nango configs | Document migration path; `optional:reset` handles fresh start |
| Template size increase causes slow `npx @inkeep/create-agents` | LOW | Worse quickstart DX | 3.3MB is small relative to `node_modules` download; degit clone is fast |
| Self-hosted deployers bookmarked companion repo URL | LOW | 404 or stale clone | Archived repo README redirects to monorepo |

## 14. Phases

### Phase 1 (This PR — new branch from main)

**Scope:** Full consolidation — move configs, rewrite script, sync template, update ALL docs and surfaces, archive companion repo.

**Starting point:** Current `main` with merged PRs #2052 and #8.

**Acceptance Criteria:**

Script + configs:
- [ ] `optional-services/` directory exists in monorepo root with all configs from companion repo
- [ ] `scripts/setup-optional.sh` contains full setup logic (no shim, no clone)
- [ ] `create-agents-template/optional-services/` mirrors monorepo's `optional-services/`
- [ ] `create-agents-template/scripts/setup-optional.sh` mirrors monorepo's script
- [ ] lint-staged sync works for both script and directory (rsync rule added)

Functional:
- [ ] `pnpm setup-dev:optional` starts all 12 services successfully
- [ ] `pnpm optional:stop` stops all services
- [ ] `pnpm optional:status` shows service status
- [ ] `pnpm optional:reset` wipes data and re-creates services
- [ ] All 9 env vars written to `.env` correctly
- [ ] Nango accessible at `http://localhost:3050`
- [ ] SigNoz accessible at `http://localhost:3080` with auto-created API key
- [ ] Jaeger accessible at `http://localhost:16686`

Documentation — local dev:
- [ ] `traces.mdx` updated — no companion repo references
- [ ] `nango.mdx` updated — no companion repo or `.optional-services/` references
- [ ] `contributing/overview.mdx` updated — no companion repo references

Documentation — deployment:
- [ ] `docker-local.mdx` updated — references monorepo `optional-services/`
- [ ] `hetzner.mdx` updated — references monorepo `optional-services/`
- [ ] `gcp-compute-engine.mdx` updated — references monorepo `optional-services/`
- [ ] `aws-ec2.mdx` updated — references monorepo `optional-services/`
- [ ] `azure-vm.mdx` updated — references monorepo `optional-services/`

Config files:
- [ ] `.gitignore` updated: remove `.optional-services/`, add `optional-services/.env`
- [ ] `create-agents-template/.gitignore` updated: same changes
- [ ] `package.json` lint-staged updated: rsync rule for `optional-services/**/*`

Companion repo:
- [ ] Companion repo archived with redirect README
- [ ] Zero references to `agents-optional-local-dev` or `.optional-services/` remain in the monorepo

**Test Plan:**
1. Fresh setup: Delete any existing optional services data, run `pnpm setup-dev:optional`, verify all services start
2. Idempotent re-run: Run `pnpm setup-dev:optional` again, verify no errors, credentials preserved
3. Reset: Run `pnpm optional:reset`, verify clean re-creation
4. Template sync: Change a file in `optional-services/`, commit, verify template copy is updated
5. Template user flow: Clone template, run `pnpm setup-dev:optional`, verify same behavior
6. CI: Verify `pnpm check` passes (lint, typecheck, tests)
7. Grep audit: `grep -r "agents-optional-local-dev\|\.optional-services" --include="*.{sh,mdx,md,json,yml,yaml,ts,tsx}" .` returns zero matches (excluding git history and this spec)
