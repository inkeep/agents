# Docker Sandbox for Ralph Execution

Network-jailed Docker environment for running the Ralph iteration loop autonomously. The sandbox provides process isolation and network restrictions while sharing the repo filesystem with the host via bind mount.

## How it works

```
Host (interactive)                    Docker (autonomous)
──────────────────                    ───────────────────
1. /ralph Phase 1 → prd.json
2. /ralph Phase 2 → .claude/ralph-prompt.md
3. pnpm install
4. git checkout -b feat/...
5. docker compose up ───────────────→ 6. .claude/ralph.sh --force
                                      7. Claude iterates (headless)
                                         - reads prd.json         ←── bind mount
                                         - writes code            ←── bind mount
                                         - commits to .git        ←── bind mount
                                         - updates prd.json       ←── bind mount
                                      8. ralph.sh exits
9. git log (sees commits) ←────────── (same filesystem)
10. git push origin <branch>
11. gh pr create
```

**Three zones:**
- **Creative** (host) — spec authoring, prd.json conversion, prompt crafting. This is where you think.
- **Execution** (Docker) — ralph.sh iterates autonomously. This is where it works.
- **Coordination** (host) — push, PR, review. This is where you ship.

## Running multiple sandboxes

The compose file intentionally does not pin `container_name`. If you need multiple `.ai-dev` sandboxes at once, start each one with its own Compose project name:

```bash
docker compose -p ai-dev-auth -f .ai-dev/docker-compose.yml up -d
docker compose -p ai-dev-billing -f .ai-dev/docker-compose.yml up -d
```

Use the same `-p <name>` value for follow-up commands like `exec`, `logs`, and `down`:

```bash
docker compose -p ai-dev-auth -f .ai-dev/docker-compose.yml exec sandbox bash
docker compose -p ai-dev-auth -f .ai-dev/docker-compose.yml down
```

For parallel `/ship` instances working on different features, see [Running parallel instances](#running-parallel-instances) below.

## When to use Docker vs host execution

| Scenario | Recommended | Why |
|----------|-------------|-----|
| Short feature (1-5 stories), developer present | Host | Simpler — Ralph Phase 3 runs directly |
| Long-running feature, run overnight or AFK | Docker | Network jail, memory limits, detachable terminal |
| CI/CD integration | Docker | Reproducible, isolated |
| No `.ai-dev/` infrastructure in repo | Host | Docker is optional |

## Skill integration

The `/ralph` and `/ship` skills support Docker execution via flags:

```
/ralph path/to/SPEC.md --docker
/ship path/to/SPEC.md --ralph-docker
```

Ralph auto-discovers the compose file in the repo (searches for a `docker-compose.yml` defining a `sandbox` service). To skip discovery, pass the path explicitly:

```
/ralph path/to/SPEC.md --docker .ai-dev/docker-compose.yml
```

When passed, Ralph runs `ralph.sh` inside the Docker sandbox instead of on the host. Phases 1-2 (Convert, Prepare) still run on the host — only Phase 3 (Execute) moves into the container.

## Prerequisites

- Docker and Docker Compose
- `ANTHROPIC_API_KEY` or Claude Code OAuth login (see auth setup below)

## Quick start

### One-time setup

```bash
cd .ai-dev

# Auth — choose one:
# Option A: API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Option B: Extract OAuth token from macOS Keychain (if logged into Claude Code)
TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | \
  python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["claudeAiOauth"]["accessToken"])' 2>/dev/null)
echo "CLAUDE_CODE_OAUTH_TOKEN=$TOKEN" > .env

# Plugin setup — REQUIRED for local marketplace plugins (/ship, /implement, etc.)
# Local directory marketplaces are symlinks that break inside Docker.
# Copy them to make them real directories:
cp -r ~/team-skills ~/.claude/plugins/marketplaces/inkeep-team-skills 2>/dev/null || true

# Build
docker compose build
```

### Usage patterns

There are three ways to use the Docker sandbox, depending on where you are in the workflow.

#### Pattern A: Host prepares, Docker executes (most common)

Use when you want the interactive spec/prd work on host, then hand off execution to Docker for autonomous iteration.

**1. Prepare on host (interactive Claude Code session):**

```bash
# In your repo root, start Claude Code and invoke /ralph with your spec:
# /ralph path/to/SPEC.md
#
# Ralph Phase 1 converts the spec → prd.json
# Ralph Phase 2 crafts the prompt → .claude/ralph-prompt.md
#                                  → .claude/ralph.sh (execution script)
#
# Tell Ralph to stop after Phase 2 — you'll handle execution via Docker.

# Create feature branch
git checkout -b feat/my-feature

# Install dependencies (container shares this via bind mount)
pnpm install

# Commit artifacts so the container starts clean
git add prd.json .claude/ralph-prompt.md .claude/ralph.sh
git commit -m "chore: add Ralph artifacts for my-feature"
```

**2. Start the sandbox and execute:**

```bash
cd .ai-dev
docker compose up -d
docker compose exec sandbox bash

# Inside the container — you are now at /workspace
.claude/ralph.sh --max-iterations 20 --max-turns 100 --force
```

You can detach (`Ctrl+P, Ctrl+Q`) and check back later.

**3. Review and ship on host:**

```bash
# Changes are already in your repo (bind mount)
git log --oneline
git diff HEAD~5

# Push and create PR
git push origin feat/my-feature
gh pr create --title "feat: my-feature" --body "..."
```

**4. Clean up:**

```bash
cd .ai-dev
docker compose down
```

#### Pattern B: Artifacts already exist, just execute

Use when `prd.json` and `.claude/ralph-prompt.md` already exist from a previous session — you just need to resume or re-run execution.

```bash
cd .ai-dev
docker compose up -d
docker compose exec sandbox bash

# Inside the container:
.claude/ralph.sh --force
```

#### Pattern C: Everything inside Docker

Use when you want the full Ralph workflow inside the container. Host plugins (including `/ralph`) are available inside Docker via the plugin mount.

```bash
cd .ai-dev
docker compose up -d
docker compose exec sandbox bash

# Inside the container — start Claude Code and use /ralph normally:
claude
# Then: /ralph path/to/SPEC.md
```

Note: Interactive spec work is less convenient inside Docker (no browser tools, no macOS computer use). Pattern A is preferred for most workflows.

#### Pattern D: Headless /ship (fully autonomous)

Launch `/ship` inside a detachable tmux session for fully autonomous execution. The process persists independently of the `docker exec` connection.

```bash
# Create feature branch + spec on host, then launch headless:
docker compose exec -d sandbox tmux new-session -d -s ship \
  'cd /workspace && claude -p "/eng:ship specs/my-feature/SPEC.md" \
    --dangerously-skip-permissions --max-turns 150 \
    --output-format stream-json --verbose \
    2>&1 | tee /workspace/tmp/ship/stream.jsonl; \
    echo $? > /workspace/tmp/ship/exit-code'
```

**Gotchas:**
- `--output-format stream-json` **requires** the `--verbose` flag when used with `-p` (Claude Code errors without it)
- Always use `claude` (not a full path) — the Dockerfile `ENV PATH` fix ensures it's found in all contexts
- `tmp/ship/state.json` is the primary monitoring channel (readable from host via bind mount)

**Monitoring:**

```bash
# Attach to the tmux session for live output:
docker compose exec sandbox tmux attach -t ship

# Check if ship is still running:
docker compose exec sandbox tmux has-session -t ship 2>/dev/null && echo "Running" || echo "Done"

# Read current phase from host:
jq -r '.currentPhase // "waiting"' tmp/ship/state.json

# Monitor loop (run on host):
while true; do
  echo "=== $(date '+%H:%M:%S') ==="
  jq -r '.currentPhase // "waiting"' tmp/ship/state.json 2>/dev/null
  docker compose -f .ai-dev/docker-compose.yml exec sandbox \
    tmux has-session -t ship 2>/dev/null \
    && echo "Status: running" \
    || echo "Status: DONE (exit: $(cat tmp/ship/exit-code 2>/dev/null))"
  docker stats --no-stream --format "Memory: {{.MemUsage}}" \
    "$(docker compose -f .ai-dev/docker-compose.yml ps -q sandbox)" 2>/dev/null
  echo "---"
  sleep 30
done
```

### Running parallel instances

Git worktrees don't work with Docker bind mounts — `.git/worktrees/` references break when only the worktree is mounted. Use full repo copies instead.

```bash
# Create isolated copies
cp -r ~/agents ~/agents-a && cd ~/agents-a && git checkout -b feat/task-a
cp -r ~/agents ~/agents-b && cd ~/agents-b && git checkout -b feat/task-b

# Launch with separate project names
# Instance A (uses ~/agents as workspace by default):
docker compose -p ship-a -f ~/agents/.ai-dev/docker-compose.yml up -d

# Instance B (override workspace volume):
docker compose -p ship-b \
  -f ~/agents/.ai-dev/docker-compose.yml \
  -f <(cat <<'EOF'
services:
  sandbox:
    volumes:
      - ~/agents-b:/workspace
      - claude-data:/home/agent/.claude
      - squid-certs:/certs:ro
      - ${HOME}/.claude/plugins:/host-plugins:ro
EOF
) up -d
```

Each instance gets its own containers, volumes, and network. Use the same `-p <name>` for all follow-up commands (`exec`, `logs`, `down`).

## What the sandbox can and cannot access

### Network (controlled by squid.conf)

| Domain | Access | Purpose |
|--------|--------|---------|
| `*.anthropic.com` | Full | Claude API calls |
| `*.claude.com` | Full | Claude Code authentication |
| `registry.npmjs.org` | Full | pnpm install |
| `*.sentry.io` | Full | Claude Code error reporting (startup hangs without) |
| `*.statsig.com` | Full | Claude Code feature flags / telemetry |
| `*.googleapis.com` | Full | Google Fonts (Next.js build), Claude Code updates |
| `*.gstatic.com` | Full | Font file CDN |
| `*.inkeep.com` | Full | Organization services |
| `api.github.com` | Full | GitHub API (PR, reviews, CI) |
| `github.com/(inkeep\|anthropics)/*` | Path-restricted | Git push/pull (org + Anthropic repos) |
| `*.githubusercontent.com/(inkeep\|anthropics)/*` | Path-restricted | GitHub raw content + security.json |
| Everything else | **Blocked** | |

**Note on web tools:** Claude Code's `WebSearch` tool works inside the container (it's server-side, routes through `api.anthropic.com`). `WebFetch` is client-side — it makes direct HTTP requests from the container, so it's blocked for non-allowed domains. This means agents can search the web but can't fetch arbitrary URLs.

### Filesystem

| Path | Container access | Notes |
|------|-----------------|-------|
| `/workspace/` | Read-write | Bind mount of repo root — same files, same `.git` |
| `/home/agent/.claude/` | Read-write | Docker volume — persists Claude auth across restarts |
| `/host-plugins/` | Read-only | Host's `~/.claude/plugins/` — used by `CLAUDE_CODE_PLUGIN_SEED_DIR` for plugin discovery at runtime (no copy) |
| Everything else | Container-only | Lost when container is removed |

### What the container CANNOT do

- Access host home directory (`~/.ssh/`, `~/.gitconfig/`, etc.)
- Access other repos or projects on the host
- Run processes on the host
- Reach arbitrary internet domains (network jail)

## Configuration

### Adding domains to the allowlist

Edit `squid.conf`:

```conf
# Add a new domain
acl my_domain dstdomain .example.com
http_access allow my_domain
```

Then restart the proxy: `docker compose restart proxy`

### Removing npm registry access

If you want the old strict model (no package installation inside container), comment out the npm ACL in `squid.conf`:

```conf
# acl npm_registry dstdomain registry.npmjs.org
# http_access allow npm_registry
```

The container will use `node_modules/` from the host's bind mount. Run `pnpm install` on the host before starting Docker.

### Adjusting memory

Edit `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 24G  # Default: 20G
```

### Pushing from inside the container

To enable git push and PR creation from inside the container:

1. Set `GITHUB_TOKEN` in `.env`
2. The `gh` CLI and git are pre-installed in the container
3. The GitHub API is already in the allowlist
4. The entrypoint auto-configures a git credential helper and SSH→HTTPS rewrite when `GITHUB_TOKEN` is set

Both `gh` and `git push` work out of the box when the token is set. This changes the trust model — the container can push code and create PRs on your behalf.

## ralph.sh

The Ralph skill places `ralph.sh` at `.claude/ralph.sh` during Phase 2 (alongside `.claude/ralph-prompt.md`). The container accesses it via the bind mount at `/workspace/.claude/ralph.sh`.

The canonical source is in the Ralph skill (`scripts/ralph.sh`). Each Phase 2 run copies a fresh version — no manual sync needed.

Run `.claude/ralph.sh --help` for CLI options.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Host Machine                        │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │            Docker Internal Network                 │  │
│  │                                                    │  │
│  │  ┌────────────┐         ┌──────────────────┐      │  │
│  │  │   Squid    │ ◄────── │  Claude Sandbox  │      │  │
│  │  │   Proxy    │         │                  │      │  │
│  │  │ (SSL bump) │         │  /workspace ─────┼──────┼──┼──► ../repo
│  │  └─────┬──────┘         └──────────────────┘      │  │
│  │        │                                           │  │
│  └────────┼───────────────────────────────────────────┘  │
│           │                                              │
│           ▼                                              │
│  ┌────────────────┐                                      │
│  │ External Net   │ ──► Only allowed domains             │
│  └────────────────┘                                      │
└──────────────────────────────────────────────────────────┘
```

## Entrypoint

The container runs `entrypoint.sh` on startup, which:

1. **Configures sandbox** — Sets `enableWeakerNestedSandbox: true` in Claude Code's settings. Claude Code's bubblewrap sandbox cannot run in unprivileged Docker; this flag tells it to use a weaker sandbox and rely on the Docker container + Squid proxy as the security boundary.
2. **Enables plugins** — Reads `installed_plugins.json` from the `CLAUDE_CODE_PLUGIN_SEED_DIR` mount and sets `enabledPlugins` in `settings.json`. The seed directory mechanism handles path resolution at runtime (no copy needed), but plugins must still be explicitly enabled.
3. **Configures git** — Sets `safe.directory /workspace` (required for bind-mounted repos with UID mismatch) and, if `GITHUB_TOKEN` is set, configures a credential helper and SSH→HTTPS rewrite for git push through the proxy.

## Container image

The sandbox uses a custom Dockerfile (`Dockerfile`) instead of the official `docker/sandbox-templates:claude-code` image. This gives us:

| Tool | Version | Why custom |
|------|---------|-----------|
| Node.js | 22 | Repo requires >=22 (official image has 20) |
| pnpm | 10.10.0 | Repo package manager (not in official image) |
| gh | Latest | GitHub CLI for optional PR workflow |
| jq | Latest | JSON processing for ralph.sh |
| Claude Code | Latest | Installed via official installer |

To update the image after changes: `docker compose build --no-cache`

## Troubleshooting

### "ECONNREFUSED" or SSL errors

```bash
docker compose ps            # Check if proxy is running
docker compose logs proxy    # Check for errors
docker compose restart       # Restart everything
```

### Domain being blocked

```bash
docker compose exec proxy tail -f /var/log/squid/access.log
```

Look for `TCP_DENIED` entries.

### Claude Code auth issues

The Claude data volume persists auth. If auth breaks:

```bash
docker compose down
docker volume rm ai-dev_claude-data
docker compose up -d
# Re-authenticate inside the container
```

### ralph.sh says "Prompt file not found"

Run `/ralph` Phase 1-2 on the host first. The prompt must exist at `.claude/ralph-prompt.md` before starting Docker execution.

### Tests fail with missing dependencies

Run `pnpm install` on the host before starting Docker. The container accesses `node_modules/` via the bind mount.

If a story requires a NEW dependency, the container can install it (npm registry is in the allowlist). But run `pnpm install` on the host afterward to ensure the lockfile is consistent.

### `pnpm test --run` doubles the `--run` flag

If the package.json script already includes `vitest --run`, passing `--run` again causes an error. Use `pnpm vitest --run` or `npx vitest --run` directly instead.

### `docker compose` commands fail

All `docker compose` commands must be run from the `.ai-dev/` directory or use `-f .ai-dev/docker-compose.yml`.

## Future work

The sandbox now supports full autonomous `/ship` execution inside Docker, including headless mode, plugin loading, git push, and parallel instances. Remaining enhancements:

| Item | What it enables | Trigger to revisit |
|------|----------------|-------------------|
| Lean seed directory builder script | Mounts only referenced plugin versions instead of full `~/.claude/plugins/` | Container startup slow due to large host plugin directory |
| Parallel automation script | Automates repo copy + compose launch for N parallel instances | Running 3+ parallel `/ship` instances regularly |
| `NODE_OPTIONS=--max-old-space-size` tuning | Better OOM diagnostics and control | OOM still occurs at 20GB |
| `CLAUDE_SPECS_DIR=/workspace/.claude/specs` | `/spec` output persists via bind mount | Want to run `/spec` inside the container |
| Convenience start script | Pre-flight checks (token set, plugins exist) | Team onboarding friction |

## Security notes

- **SSL inspection**: The proxy performs MITM on HTTPS traffic for URL path filtering. All traffic is decrypted by the proxy.
- **Network isolation**: The sandbox has no direct internet access — all traffic goes through the proxy.
- **Bind mount**: The container has read-write access to the entire repo directory, including `.git/` and `.env` files.
- **npm registry**: Enabled by default. `pnpm install` inside the container triggers postinstall scripts from downloaded packages. These scripts run with the same filesystem access as Ralph (the repo directory). See squid.conf to disable if this is a concern.
