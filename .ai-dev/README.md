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
- The `/ralph` skill installed (for Phase 1-2 on host)
- `ANTHROPIC_API_KEY` set in your environment

## Quick start

### One-time setup

```bash
cd .ai-dev
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY

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

## What the sandbox can and cannot access

### Network (controlled by squid.conf)

| Domain | Access | Purpose |
|--------|--------|---------|
| `*.anthropic.com` | Full | Claude API calls |
| `*.claude.com` | Full | Claude Code authentication |
| `registry.npmjs.org` | Full | pnpm install |
| `*.inkeep.com` | Full | Organization services |
| `api.github.com` | Full | GitHub API (PR, reviews, CI) |
| `github.com/inkeep/*` | Path-restricted | Git push/pull (org repos only) |
| `*.githubusercontent.com/inkeep/*` | Path-restricted | GitHub raw content |
| Everything else | **Blocked** | |

### Filesystem

| Path | Container access | Notes |
|------|-----------------|-------|
| `/workspace/` | Read-write | Bind mount of repo root — same files, same `.git` |
| `/home/agent/.claude/` | Read-write | Docker volume — persists Claude auth across restarts |
| `/host-plugins/` | Read-only | Host's `~/.claude/plugins/` — copied to container on startup by entrypoint |
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
      memory: 16G  # Default: 14G
```

### Pushing from inside the container

To enable git push and PR creation from inside the container:

1. Set `GITHUB_TOKEN` in `.env`
2. The `gh` CLI and git are pre-installed in the container
3. The GitHub API is already in the allowlist

**Note:** `gh` CLI reads `GITHUB_TOKEN` from the environment and works out of the box. For `git push` to authenticate, you would also need a git credential helper configured — this is not set up by default. A future enhancement could add `git config --global credential.helper '!f() { echo "password=$GITHUB_TOKEN"; }; f'` to `entrypoint.sh`.

This changes the trust model — the container can now push code and create PRs on your behalf.

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

1. **Copies host plugins** — If `~/.claude/plugins/` is mounted at `/host-plugins/`, copies them into the container's `~/.claude/plugins/` so skills and hooks are available inside Docker.
2. **Configures sandbox** — Sets `enableWeakerNestedSandbox: true` in Claude Code's settings. Claude Code's bubblewrap sandbox cannot run in unprivileged Docker; this flag tells it to use a weaker sandbox and rely on the Docker container + Squid proxy as the security boundary.

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

## Future work

The current sandbox is **execution-only** — ralph.sh iterates inside Docker, host handles everything else (spec, push, PR, review). A future upgrade could enable full autonomous operation inside the container:

| Item | What it enables | Trigger to revisit |
|------|----------------|-------------------|
| Git credential helper in entrypoint | `git push` from inside the container | Want to push/PR from Docker instead of host |
| `CLAUDE_SPECS_DIR=/workspace/.claude/specs` | `/spec` output persists via bind mount | Want to run `/spec` inside the container |
| `gh` auth config (`GH_TOKEN` export) | `gh pr create`, `gh api` from inside | Want full `/ship` review loop inside Docker |
| Git URL HTTPS rewrite (`insteadOf ssh`) | Prevents SSH attempts through the proxy | If tools default to SSH and silently fail |
| Health checks in docker-compose | Proxy readiness before sandbox starts | Intermittent startup failures |
| Convenience start script | Pre-flight checks (token set, plugins exist) | Team onboarding friction |

See `~/.claude/specs/docker-sandbox-upgrade/SPEC.md` for the full analysis that drove these decisions.

## Security notes

- **SSL inspection**: The proxy performs MITM on HTTPS traffic for URL path filtering. All traffic is decrypted by the proxy.
- **Network isolation**: The sandbox has no direct internet access — all traffic goes through the proxy.
- **Bind mount**: The container has read-write access to the entire repo directory, including `.git/` and `.env` files.
- **npm registry**: Enabled by default. `pnpm install` inside the container triggers postinstall scripts from downloaded packages. These scripts run with the same filesystem access as Ralph (the repo directory). See squid.conf to disable if this is a concern.
