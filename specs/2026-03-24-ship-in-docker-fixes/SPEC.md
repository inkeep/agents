# Ship-in-Docker: Infrastructure Fixes

**Purpose:** Apply 10 validated operational fixes to the `.ai-dev/` Docker sandbox so that `/ship` runs autonomously inside containers — including headless execution and parallel multi-instance support.

Every change was empirically validated during end-to-end testing and then researched for best practices.

**Related spec:** Parallel orchestration skill design → `specs/2026-03-24-parallel-docker-ship/SPEC.md` (depends on this spec being applied first)

---

## 1. Problem Statement

**Situation:** The `.ai-dev/` Docker sandbox provides a Squid-proxy-jailed container for running Claude Code autonomously against this monorepo. It supports the basic workflow: bind-mount the repo, pass API keys, run `ralph.sh` or Claude Code headlessly.

**Complication:** Running `/ship` (the full spec→implement→review→QA workflow) inside these containers fails at multiple stages:

| Failure | Impact | Root cause |
|---|---|---|
| `claude: command not found` in tmux/headless | Blocks all headless execution | Dockerfile `ENV PATH` points to `~/.claude/bin` but installer puts binary at `~/.local/bin` |
| Plugin copy takes 30+ min and crashes | Blocks container startup | Entrypoint `cp -r` of 12GB host plugin cache |
| `/ship` skill not loaded | Blocks /ship entirely | `installed_plugins.json` silently fails in Docker; `enabledPlugins` not set |
| `Cannot find module @rollup/rollup-linux-arm64-gnu` | Blocks build/test/typecheck | macOS host installs darwin-only native modules; container needs linux |
| `pnpm typecheck` OOM killed (exit 137) | Blocks /ship verification | 14GB memory limit insufficient for agents-api typecheck |
| Squid blocks telemetry/fonts/security.json | Startup hangs, build fails | Missing domains in allowlist |
| No health check on proxy | Startup race condition | Sandbox starts before proxy is ready |
| No git config for bind mount | `git status` fails with "dubious ownership" | UID mismatch between host and container |

**Resolution:** Apply the 10 fixes documented below. The result is validated: `/ship` completes autonomously (exit 0, working code produced), and 2+ parallel instances run simultaneously without conflicts.

---

## 2. Evidence

All changes are backed by empirical testing and structured research:

| Source | Location | What it contains |
|---|---|---|
| Validation test journal | `~/test-ship-docker/agents-test/specs/2026-03-24-ship-in-docker-validation/evidence/test-journal.md` | Step-by-step record of every fix discovered during 7-phase end-to-end testing |
| Research report | `~/reports/claude-code-docker-operational-fixes/REPORT.md` | Root cause analysis, best practices, alternatives, and upstream recommendations for each fix |
| Original validation spec | `~/test-ship-docker/agents-test/specs/2026-03-24-ship-in-docker-validation/SPEC.md` | The test plan that was executed |

---

## 3. Changes

Six files are modified or created. Each subsection is a self-contained change with rationale.

### 3.1 Dockerfile — Fix PATH, add tmux

**Current state:** Line 38 sets `ENV PATH="/home/agent/.claude/bin:$PATH"`. The Claude Code installer (`claude.ai/install.sh`) actually installs to `~/.local/bin/claude` (symlink to `~/.local/share/claude/versions/<ver>`). The mismatch causes `command not found` in any non-login shell context — tmux sessions, `docker exec -d`, cron, supervisord.

**Change:**

```diff
 RUN apt-get update && apt-get install -y \
     git \
     curl \
     ca-certificates \
     sudo \
     jq \
+    tmux \
     && rm -rf /var/lib/apt/lists/*
```

```diff
-ENV PATH="/home/agent/.claude/bin:$PATH"
+ENV PATH="/home/agent/.local/bin:${PATH}"
```

**Why `ENV PATH`:** It's the only PATH mechanism that works for ALL process types in Docker — login shells, non-login shells, interactive, non-interactive, `docker exec`, `docker exec -d`, tmux, s6, supervisord. [Docker Dockerfile reference](https://docs.docker.com/reference/dockerfile/#env): "The environment variables set using ENV will persist when a container is run from the resulting image."

**Why tmux:** Headless `/ship` runs inside a detachable tmux session. Benefits: attachable for live debugging (`tmux attach -t ship`), session-detectable (`tmux has-session`), full scrollback history, and the process persists independently of the `docker exec` connection.

### 3.2 docker-compose.yml — Plugin seed, health check, memory, env vars

**Changes (additive — don't remove existing config):**

Add to `proxy` service:
```yaml
    healthcheck:
      test: ["CMD-SHELL", "bash -c 'echo > /dev/tcp/127.0.0.1/3128'"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 10s
```

Add to `sandbox.environment`:
```yaml
      - CLAUDE_PROJECT_DIR=/workspace
      - CLAUDE_CODE_PLUGIN_SEED_DIR=/host-plugins
      # OAuth token — alternative to ANTHROPIC_API_KEY for Max subscription users
      - CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN:-}
```

Change `sandbox.depends_on`:
```yaml
    depends_on:
      proxy:
        condition: service_healthy
```

Change `sandbox.deploy.resources.limits.memory`:
```yaml
          memory: 20G
```

**Rationale for each:**

| Change | Why |
|---|---|
| TCP health check | `squidclient` is not in the `squid-openssl` Ubuntu package and is [deprecated in Squid 7+](https://wiki.squid-cache.org/Features/CacheManager/SquidClientTool). TCP port check is zero-dependency, sub-millisecond. |
| `service_healthy` dependency | Without this, the sandbox starts before the proxy is accepting connections. Claude Code's first API call fails intermittently. |
| `CLAUDE_PROJECT_DIR=/workspace` | The `/ship` stop hook resolves `tmp/ship/` relative to the project directory. Inside the container, the project root is `/workspace`, not the host path. Without this, the hook can't find state files. |
| `CLAUDE_CODE_PLUGIN_SEED_DIR=/host-plugins` | [Official mechanism](https://code.claude.com/docs/en/plugin-marketplaces#pre-populate-plugins-for-containers) for loading plugins in Docker. Read-only, resolves paths at runtime by probing `$SEED_DIR/marketplaces/<name>/`. **Critical pre-flight requirement:** Local directory marketplaces (e.g., `inkeep-team-skills` sourced from `~/team-skills`) exist as symlinks in `~/.claude/plugins/marketplaces/` that break inside Docker. Before launching Docker, copy local marketplace directories into the seed: `cp -r ~/team-skills ~/.claude/plugins/marketplaces/inkeep-team-skills` (see §3.6 README prerequisites). Without this, only GitHub-hosted marketplaces load. |
| 20GB memory | The `agents-api` TypeScript typecheck consumes 8-14GB of V8 heap (likely [Zod-related](https://github.com/microsoft/TypeScript/issues/44299)). During /ship Phase 2, build + typecheck + tests run concurrently → peak ~12-18GB. At 14GB, the OOM killer fires (exit 137, no stack trace). 20GB provides 1.5x headroom. |

### 3.3 entrypoint.sh — Rewrite (simplified)

**Current state:** The entrypoint has a `cp -r /host-plugins/* /home/agent/.claude/plugins/` that copies the entire 12GB host plugin directory. This takes 30+ minutes, crashes on permission-denied `.git` objects, copies broken absolute-path symlinks, and copies all historical versions.

**Replace entire file with:**

```bash
#!/bin/bash
set -e

# Enable weaker nested sandbox for Docker environment.
# Claude Code's bubblewrap sandbox cannot run in unprivileged Docker containers.
# Our security boundary is the Docker container + Squid proxy network jail.
SETTINGS_FILE="/home/agent/.claude/settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
    echo '{}' > "$SETTINGS_FILE"
fi
if command -v jq &>/dev/null; then
    tmp=$(jq '.sandbox.enableWeakerNestedSandbox = true' "$SETTINGS_FILE")
    echo "$tmp" > "$SETTINGS_FILE"

    # Enable plugins discovered in the seed directory.
    # CLAUDE_CODE_PLUGIN_SEED_DIR handles path resolution at runtime, but
    # enabledPlugins must still be set in settings.json for Claude Code to
    # actually load them. (Known issue: https://github.com/anthropics/claude-code/issues/20661)
    if [ -d "${CLAUDE_CODE_PLUGIN_SEED_DIR:-}" ]; then
        INSTALLED_FILE="${CLAUDE_CODE_PLUGIN_SEED_DIR}/installed_plugins.json"
        if [ -f "$INSTALLED_FILE" ]; then
            for key in $(jq -r '.plugins | keys[]' "$INSTALLED_FILE" 2>/dev/null); do
                tmp=$(jq --arg k "$key" '.enabledPlugins[$k] = true' "$SETTINGS_FILE")
                echo "$tmp" > "$SETTINGS_FILE"
            done
        fi
    fi
fi

# Git safe.directory — bind-mounted /workspace has different ownership than
# the container's agent user. Without this, git refuses to operate.
git config --global --add safe.directory /workspace

# Git credential helper — enables git push from inside the container using
# GITHUB_TOKEN env var.
if [ -n "${GITHUB_TOKEN:-}" ]; then
    git config --global credential.helper '!f() { echo "password=$GITHUB_TOKEN"; }; f'
    git config --global url."https://github.com/".insteadOf "git@github.com:"
fi

exec "$@"
```

**What was removed:** The `cp -r /host-plugins/*` block. Replaced by `CLAUDE_CODE_PLUGIN_SEED_DIR` which mounts the host plugins directory read-only and resolves paths at runtime — no copy needed.

**What was added:**
- `enabledPlugins` auto-population from the seed's `installed_plugins.json`. This is needed because installing a plugin and enabling it are separate operations in Claude Code, and the seed mechanism doesn't auto-enable.
- `git safe.directory /workspace` — required because bind-mounted `/workspace` is owned by the host UID, not the container's `agent` user.
- Git credential helper + SSH→HTTPS rewrite — enables `git push` through the HTTPS-only proxy.

### 3.4 squid.conf — Complete domain allowlist

**Add after the existing `npm_registry` ACL:**

```conf
# Telemetry — Claude Code sends telemetry to Sentry and Statsig.
# Without these, startup can hang waiting for telemetry endpoints.
# Ref: https://code.claude.com/docs/en/network-config
acl sentry dstdomain .sentry.io
acl statsig dstdomain statsig.anthropic.com .statsig.com

# Google services — fonts for Next.js build, storage for Claude updates
acl google dstdomain .googleapis.com .gstatic.com
```

**Add the allow rules after `http_access allow npm_registry`:**

```conf
http_access allow sentry
http_access allow statsig
http_access allow google
```

**Change the `githubusercontent_org` path regex to include `anthropics`:**

```diff
-acl githubusercontent_org urlpath_regex ^/inkeep(/|$)
+acl githubusercontent_org urlpath_regex ^/(inkeep|anthropics)(/|$)
```

Also do the same for `github_org_path`:
```diff
-acl github_org_path urlpath_regex ^/inkeep(/|$)
+acl github_org_path urlpath_regex ^/(inkeep|anthropics)(/|$)
```

**Why each domain:**

| Domain | Why | Source |
|---|---|---|
| `.sentry.io` | Claude Code error reporting. Without it, startup may hang. | [Anthropic network config](https://code.claude.com/docs/en/network-config) |
| `.statsig.com` | Claude Code feature flags / telemetry | [Anthropic network config](https://code.claude.com/docs/en/network-config) |
| `.googleapis.com` | `next/font/google` downloads fonts at build time. Also covers `storage.googleapis.com` for Claude Code updates. | [Next.js font docs](https://nextjs.org/docs/app/getting-started/fonts) |
| `.gstatic.com` | Font file CDN (companion to googleapis.com) | Empirical — blocked during manage-ui build |
| `/anthropics/` path on github/githubusercontent | Claude Code fetches `security.json` from `anthropics/claude-plugins-official` | Empirical — `TCP_DENIED` in proxy logs during T1 |

**Domains confirmed NOT needed:**
- CDN domains (jsdelivr, unpkg) — PGlite WASM is bundled in the npm package
- Vercel telemetry — disabled by default in Docker (no TTY)
- Node.js download domains — pre-installed in Docker image

### 3.5 .npmrc — Cross-platform native modules (NEW FILE at repo root)

**Create `~/agents/.npmrc`:**

```ini
supportedArchitectures[os][]=current
supportedArchitectures[os][]=linux
supportedArchitectures[cpu][]=current
supportedArchitectures[cpu][]=arm64
supportedArchitectures[libc][]=current
supportedArchitectures[libc][]=glibc
supportedArchitectures[libc][]=musl
```

**Then run `pnpm install --force` once** to trigger re-resolution with the new architectures.

**Why:** The workspace is bind-mounted from macOS into a Linux container. macOS `pnpm install` only installs `@rollup/rollup-darwin-arm64`, `@esbuild/darwin-arm64`, etc. The container needs the `linux-arm64-gnu` variants. Without both, Vitest, Turborepo builds, and any esbuild/rollup/swc-based tool crash.

This is [pnpm's official mechanism](https://pnpm.io/settings#supportedarchitectures) for multi-platform support. Size impact: ~75-100MB extra in `node_modules/` (negligible for a 2-3GB monorepo).

**Known pnpm bugs (non-blocking):**
- [#9013](https://github.com/pnpm/pnpm/issues/9013): Changing config requires `--force` or deleting `node_modules`
- [#9940](https://github.com/pnpm/pnpm/issues/9940): May install ALL platform variants for some packages
- [#7362](https://github.com/pnpm/pnpm/issues/7362): `libc` filtering broken (both glibc+musl always installed)

### 3.6 README.md — Update operational documentation

The README needs significant updates to reflect the new capabilities. Key sections:

**A0) Prerequisites for plugin loading** — Add a pre-flight section before the launch pattern:

```bash
# REQUIRED: Copy local marketplace directories into the plugin seed.
# CLAUDE_CODE_PLUGIN_SEED_DIR probes marketplaces/<name>/ to discover plugins.
# GitHub-hosted marketplaces (e.g., claude-plugins-official) are already present.
# Local directory marketplaces (e.g., inkeep-team-skills from ~/team-skills) are
# symlinks that break inside Docker. Copy them to make them real directories:

# For each local marketplace in known_marketplaces.json with "source": "directory":
cp -r ~/team-skills ~/.claude/plugins/marketplaces/inkeep-team-skills

# Verify:
ls ~/.claude/plugins/marketplaces/inkeep-team-skills/plugins/
# Should show: eng  gtm  shared
```

Without this step, only GitHub-hosted marketplace plugins load. Local plugins (including `/ship`, `/implement`, `/spec`, and all engineering skills) will silently fail to load.

**A0b) Authentication** — Document both auth methods in `.ai-dev/.env`:

```bash
# Option 1: API key (simplest — works for all API key holders)
ANTHROPIC_API_KEY=sk-ant-...

# Option 2: OAuth token (for Max subscription users without an API key)
# Generate on host: claude setup-token
# Paste the output here:
CLAUDE_CODE_OAUTH_TOKEN=eyJhbG...

# Only one is needed. API key takes precedence if both are set.
```

**A) Headless /ship launch pattern** — Add a new section documenting how to run /ship headlessly inside the container:

```bash
# Create feature branch + spec, then launch headless via tmux:
docker compose exec -d sandbox tmux new-session -d -s ship \
  'cd /workspace && claude -p "/eng:ship specs/my-feature/SPEC.md" \
    --dangerously-skip-permissions --max-turns 150 \
    --output-format stream-json --verbose \
    2>&1 | tee /workspace/tmp/ship/stream.jsonl; \
    echo $? > /workspace/tmp/ship/exit-code'
```

Document these gotchas discovered during validation:
- `--output-format stream-json` **requires** the `--verbose` flag when used with `-p` (Claude Code will error without it)
- Always use `claude` (not a full path) — the Dockerfile `ENV PATH` fix ensures it's found in all contexts
- `tmp/ship/state.json` is the primary monitoring channel (readable from host via bind mount)

**B) Monitoring script** — Add a concrete monitoring script, not just bullet points:

```bash
#!/bin/bash
# .ai-dev/ship-monitor.sh — run on host to monitor headless /ship
COMPOSE_FILE="${1:-.ai-dev/docker-compose.yml}"
CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q sandbox)

while true; do
  echo "=== $(date '+%H:%M:%S') ==="
  # Phase
  jq -r '.currentPhase // "waiting"' tmp/ship/state.json 2>/dev/null
  # Still running?
  docker exec "$CONTAINER" tmux has-session -t ship 2>/dev/null \
    && echo "Status: running" || echo "Status: DONE (exit: $(cat tmp/ship/exit-code 2>/dev/null))"
  # Memory
  docker stats --no-stream --format "Memory: {{.MemUsage}}" "$CONTAINER" 2>/dev/null
  echo "---"
  sleep 30
done
```

**C) Parallel instance documentation** — Document the validated pattern (repo copies, NOT worktrees):

```bash
# Git worktrees DON'T work with Docker bind mounts — .git/worktrees/
# references break when only the worktree is mounted. Use full copies.

# Create isolated copies
cp -r ~/agents ~/agents-a && cd ~/agents-a && git checkout -b feat/task-a
cp -r ~/agents ~/agents-b && cd ~/agents-b && git checkout -b feat/task-b

# Launch with separate project names + volume overrides
docker compose -p ship-a -f ~/agents/.ai-dev/docker-compose.yml up -d  # uses ~/agents
# For instance B, override the workspace volume:
docker compose -p ship-b \
  -f ~/agents/.ai-dev/docker-compose.yml \
  -f <(cat <<EOF
services:
  sandbox:
    volumes:
      - ~/agents-b:/workspace
      - claude-data:/home/agent/.claude
      - squid-certs:/certs:ro
      - \${HOME}/.claude/plugins:/host-plugins:ro
EOF
) up -d
```

**D) Troubleshooting additions:**
- `pnpm test --run` doubles the `--run` flag if the package.json script already includes `vitest --run`. Use `pnpm vitest --run` or `npx vitest --run` directly instead.
- All `docker compose` commands must run from `.ai-dev/` or use `-f .ai-dev/docker-compose.yml`.

**E) Update existing sections:**
- Network table (lines 186-197): add sentry, statsig, googleapis, gstatic domains
- Filesystem table (line 204): change `/host-plugins/` description from "copied to container on startup by entrypoint" → "Read-only mount — used by `CLAUDE_CODE_PLUGIN_SEED_DIR` for plugin discovery at runtime (no copy)"
- Entrypoint section (lines 294-299): describe simplified entrypoint + `CLAUDE_CODE_PLUGIN_SEED_DIR`
- Memory adjustment section (line 248): update default comment from `14G` to `20G`
- Future work table: remove implemented items (git credential helper, health checks), add new items (lean seed builder, parallel automation script, NODE_OPTIONS tuning)

---

## 4. Implementation Order

The changes have dependencies:

```
1. Dockerfile (PATH fix, tmux)      ──┐
2. docker-compose.yml (all changes) ──┼── commit together
3. entrypoint.sh (rewrite)          ──┤
4. squid.conf (domain additions)    ──┘
5. .npmrc (new file)                ──── separate commit (affects lockfile)
6. README.md                        ──── separate commit
```

**Commit 1:** `.ai-dev/` infrastructure changes (items 1-4)
**Commit 2:** `.npmrc` + `pnpm-lock.yaml` changes from `pnpm install --force`
**Commit 3:** `.ai-dev/README.md` documentation update

---

## 5. Acceptance Criteria

### Must-have (blocks merge)

- [ ] `docker compose build` succeeds with no errors
- [ ] `docker compose up -d` starts both containers; proxy shows `healthy`
- [ ] `docker compose exec sandbox claude --version` returns version (verifies PATH fix)
- [ ] `docker compose exec sandbox bash -lc 'cd /workspace && git status'` works (verifies git safe.directory)
- [ ] `docker compose exec sandbox bash -lc 'cd /workspace && pnpm build'` succeeds (verifies .npmrc cross-platform modules)
- [ ] Proxy logs show no `TCP_DENIED` for anthropic, sentry, statsig, googleapis, gstatic domains
- [ ] `docker compose exec sandbox bash -lc 'cd /workspace && claude -p "Say OK" --dangerously-skip-permissions --max-turns 1 --output-format json'` returns success (verifies full stack)
- [ ] Plugins from seed are loaded (verify with `--output-format stream-json --verbose | head -1 | jq '.plugins'`)
- [ ] `pnpm install` on host still works after `.npmrc` addition
- [ ] `pnpm build` on host still works after `.npmrc` addition

### Should-have (validates the goal)

- [ ] Headless `/ship` completes with exit code 0 inside the container
- [ ] `tmp/ship/state.json` is readable from the host during execution
- [ ] Container peak memory stays under 20GB during /ship run

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `CLAUDE_CODE_PLUGIN_SEED_DIR` doesn't work on current Claude Code version | Medium | Validated on v2.1.81 during testing. Fallback: use `--plugin-dir` flag. If neither works, revert to simplified entrypoint copy (copy only referenced version, not all 12GB). |
| `.npmrc` `supportedArchitectures` installs too many variants | Low | pnpm bug #9940 may install ALL variants (~600MB extra). Acceptable — doesn't break anything, just wastes disk. |
| `.npmrc` change modifies `pnpm-lock.yaml` | Low | Expected — additive changes only (new optional deps for other platforms). Review the diff carefully per AGENTS.md lockfile strategy. |
| 20GB memory exceeds Docker Desktop default | Low | Docker Desktop default is "use all available." Only matters if explicitly configured lower. Document the requirement. |
| Claude Code installer changes binary location in future versions | Low | If it moves from `~/.local/bin`, `ENV PATH` needs updating. Check `which claude` inside container after Claude Code upgrades. |
| Agent can't do browser/visual verification inside Docker | Low | Known limitation. /ship QA phase degrades gracefully to bash-only testing. Visual verification requires `pnpm dev` on the host. |
| Claude Code CLI flags change between versions | Low | `--output-format stream-json --verbose` requirement was undocumented. Pin to known-working patterns in README. |

---

## 7. Out of Scope

| Item | Why deferred | Trigger to revisit |
|---|---|---|
| Lean seed directory builder script | Optimization — mounting full `~/.claude/plugins/` works, just larger I/O | If container startup is slow due to large host plugin directory |
| `NODE_OPTIONS=--max-old-space-size` | 20GB provides sufficient headroom; adding this is only needed for better OOM diagnostics | If OOM still occurs at 20GB |
| TypeScript project references | Long-term memory fix for tsc, but requires tsconfig restructuring across the monorepo | If memory continues to be a problem across multiple repos |
| Parallel orchestration skill | See separate spec: `specs/2026-03-24-parallel-docker-ship/SPEC.md` | N/A |
| Bug reports to Anthropic | 2 bugs (enabledPlugins #20661, PATH mismatch), 1 feature request (plugin export) | After this PR merges — file with evidence from the research report |
| Browser/visual QA inside Docker | No browser available in container. /ship QA degrades to bash-only. | If headless browser tools (Playwright) become viable in Docker sandboxes |
| Rebuild feedback loop optimization | Each .ai-dev change requires image rebuild (~2 min). Could use dev-mode volume mounts for entrypoint/squid.conf to iterate faster. | If .ai-dev changes become frequent |
| `pnpm test --run` flag doubling | Package scripts include `vitest --run`; passing `--run` again errors. Not a .ai-dev fix — it's a repo-level script issue. | When touching test scripts |
| Agent orchestration skill for parallel Docker /ship | See separate spec: `specs/2026-03-24-parallel-docker-ship/SPEC.md` | N/A — separate spec |

---

## 8. Decision Log

| # | Decision | Status | Rationale |
|---|---|---|---|
| D1 | Use `CLAUDE_CODE_PLUGIN_SEED_DIR` over entrypoint copy | LOCKED | Official Anthropic mechanism, read-only, handles path resolution at runtime. Eliminates 5 fixes worth of entrypoint complexity. Documented at [plugin-marketplaces#pre-populate-plugins-for-containers](https://code.claude.com/docs/en/plugin-marketplaces#pre-populate-plugins-for-containers). |
| D2 | TCP health check over squidclient | LOCKED | `squidclient` not in `squid-openssl` package, deprecated in Squid 7+. TCP check is zero-dependency, sufficient for `service_healthy` gate. |
| D3 | `.npmrc` `supportedArchitectures` over container-side install | LOCKED | Official pnpm mechanism. Container-side install destroys host macOS packages (shared bind mount). Despite known pnpm bugs, it's the best available option. |
| D4 | 20GB memory over TypeScript tuning | DIRECTED | Pragmatic — tsc memory is dominated by Zod type inference which requires monorepo-wide tsconfig restructuring to fix. 20GB provides headroom now. |
| D5 | `ENV PATH ~/.local/bin` over tmux-specific workarounds | LOCKED | Root cause fix. `ENV PATH` is the only mechanism guaranteed for all shell types in Docker. The tmux PATH hack in the validation was treating a symptom. |
| D6 | Tiered squid allowlist based on official Anthropic docs | LOCKED | Uses [code.claude.com/docs/en/network-config](https://code.claude.com/docs/en/network-config) as authoritative source. Tiered organization makes required vs optional domains clear. |
| D7 | Auto-populate `enabledPlugins` from seed | DIRECTED | Workaround for [known bug #20661](https://github.com/anthropics/claude-code/issues/20661) where installing a plugin doesn't enable it. May become unnecessary in future Claude Code versions. |

---

## 9. Open Questions

| # | Question | Priority | Status |
|---|---|---|---|
| OQ1 | Does `CLAUDE_CODE_PLUGIN_SEED_DIR` work on the production repo (~/agents) with the current installed plugins? | P0 | Answered during implementation — verify in acceptance criteria |
| OQ2 | Does `pnpm install --force` after `.npmrc` change produce a clean lockfile diff? | P0 | Answered during implementation — review the diff |

---

## 10. Agent Constraints

```
SCOPE:
  .ai-dev/Dockerfile
  .ai-dev/docker-compose.yml
  .ai-dev/entrypoint.sh
  .ai-dev/squid.conf
  .ai-dev/README.md
  .npmrc (repo root — new file)

EXCLUDE:
  All application code (packages/, agents-api/, agents-manage-ui/, etc.)
  Database schemas, migrations
  CI/CD pipelines
  Any file outside .ai-dev/ and .npmrc

STOP_IF:
  Changes would affect non-Docker workflows (host pnpm install, host pnpm build must still work)
  .npmrc change breaks existing lockfile resolution (should only add, not change existing resolutions)
  entrypoint.sh changes affect container behavior when CLAUDE_CODE_PLUGIN_SEED_DIR is NOT set

ASK_FIRST:
  Before modifying pnpm-lock.yaml (review the diff for unexpected changes)
  Before removing any existing functionality from README.md
```

