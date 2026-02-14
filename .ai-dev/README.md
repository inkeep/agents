# Claude Code Sandboxed Development Environment

This directory contains a Docker-based sandbox for running Claude Code with network restrictions.

## Overview

The sandbox provides:
- **Network isolation**: Only whitelisted domains are accessible
- **SSL inspection**: URL path-based filtering (e.g., only `github.com/inkeep/*`)
- **Full repo access**: Your local repository is mounted into the container
- **Persistent Claude data**: Authentication and settings survive container restarts

## Allowed Domains

| Domain | Access Level |
|--------|--------------|
| `*.inkeep.com` | Full access |
| `github.com/inkeep/*` | Path-restricted |
| `*.githubusercontent.com/inkeep/*` | Path-restricted |
| `api.github.com/repos/inkeep/*` | Path-restricted |
| `*.anthropic.com` | Full access (required for Claude) |

All other domains are blocked.

## Quick Start

```bash
cd .ai-dev

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start the sandbox
docker compose up -d

# Attach to get an interactive shell
docker attach claude-sandbox

# Inside the container, run claude
claude
```

## Development Workflow

### Git Operations

The container mounts the parent directory (`..`) to `/workspace`. This means:

- **Same git repo**: You're working on the exact same files as your host machine
- **Branches are shared**: Any branch you create inside the container is immediately visible outside
- **Commits persist**: All git history is on your host filesystem
- **No sync needed**: Changes are real-time (it's a volume mount, not a copy)

#### Typical workflow:

```bash
# On host: create a feature branch
git checkout -b feature/my-feature

# Start the sandbox
cd .ai-dev && docker compose up -d
docker attach claude-sandbox

# Inside container: work with Claude
claude

# Claude can:
# - Read/write files in /workspace
# - Create git commits
# - Push to github.com/inkeep/* repos (if allowed)

# Exit container (Ctrl+P, Ctrl+Q to detach, or exit to stop)

# On host: your changes are already there
git status
git push origin feature/my-feature
```

### File Persistence

| Location | Persisted? | Notes |
|----------|------------|-------|
| `/workspace/*` | Yes | Mounted from host - your actual repo |
| `/home/user/.claude` | Yes | Docker volume - survives restarts |
| Other container files | No | Lost when container is removed |

## Commands Reference

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View proxy logs (see allowed/blocked requests)
docker compose logs proxy

# View Claude container logs
docker compose logs claude-sandbox

# Get interactive shell
docker attach claude-sandbox

# Detach without stopping: Ctrl+P, Ctrl+Q
# Exit and stop: Ctrl+C or 'exit'

# Run one-off command
docker compose exec claude-sandbox claude --version

# Rebuild after config changes
docker compose build --no-cache
docker compose up -d
```

## Configuration

### Adding Allowed Domains

Edit `squid.conf` and add new ACL rules:

```conf
# Add a new domain
acl my_domain dstdomain .example.com
http_access allow my_domain
```

Then restart the proxy:

```bash
docker compose restart proxy
```

### Adding Path-Restricted Domains

For URL path filtering (requires SSL inspection):

```conf
# Domain ACL
acl example_domain dstdomain example.com
# Path ACL
acl example_path urlpath_regex ^/allowed-path(/|$)
# Combined rule
http_access allow example_domain example_path
```

### Adjusting Memory

Edit `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 16G  # Increase as needed
```

### Mounting Additional Directories

Edit the `volumes` section in `docker-compose.yml`:

```yaml
volumes:
  - ..:/workspace
  - ~/other-repo:/other-repo:ro  # Read-only mount
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Host Machine                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Docker Internal Network                 │    │
│  │                                                      │    │
│  │   ┌──────────────┐         ┌──────────────────┐    │    │
│  │   │    Squid     │ ◄────── │  Claude Sandbox  │    │    │
│  │   │    Proxy     │         │                  │    │    │
│  │   │  (SSL bump)  │         │  /workspace ─────┼────┼────┼──► ../
│  │   └──────┬───────┘         └──────────────────┘    │    │
│  │          │                                          │    │
│  └──────────┼──────────────────────────────────────────┘    │
│             │                                                │
│             ▼                                                │
│   ┌─────────────────┐                                       │
│   │ External Network │ ──► Only allowed domains             │
│   └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### "ECONNREFUSED" to Anthropic API

The proxy isn't running or Claude can't reach it:

```bash
docker compose ps          # Check if proxy is running
docker compose logs proxy  # Check for errors
docker compose restart     # Restart everything
```

### SSL Certificate Errors

The CA certificate isn't being trusted:

```bash
# Check if cert exists in shared volume
docker compose exec claude-sandbox ls -la /certs/

# Rebuild to regenerate certs
docker compose down
docker volume rm ai-dev_squid-certs
docker compose build --no-cache
docker compose up -d
```

### Domain Being Blocked

Check the proxy logs to see what's being denied:

```bash
docker compose exec proxy tail -f /var/log/squid/access.log
```

Look for `TCP_DENIED` entries to see blocked requests.

### Container Exits Immediately

Make sure you're using the correct attach command:

```bash
docker compose up -d       # Start detached
docker attach claude-sandbox  # Then attach
```

## Ralph Loop (Archived)

> **Note:** PRD authoring and autonomous implementation use the `/spec`, `/ralph`, and `/feature-dev` skills in `inkeep/team-skills`. The scripts below are preserved for reference but are not actively maintained.

Ralph is an autonomous loop that runs Claude iteratively against a PRD until all user stories pass.

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    Ralph Loop                            │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ Read PRD │───►│  Select  │───►│Implement │          │
│  │   .json  │    │  Story   │    │  Story   │          │
│  └──────────┘    └──────────┘    └────┬─────┘          │
│                                       │                 │
│  ┌──────────┐    ┌──────────┐    ┌────▼─────┐          │
│  │  Signal  │◄───│  Update  │◄───│   Test   │          │
│  │ Complete │    │   PRD    │    │ & Commit │          │
│  └──────────┘    └──────────┘    └──────────┘          │
│        │                              │                 │
│        │         All done?            │ More stories   │
│        ▼              ▼               ▼                 │
│      EXIT         Fresh Claude    NEXT ITERATION       │
└─────────────────────────────────────────────────────────┘
```

Each iteration:
1. Fresh Claude instance (clean context)
2. Reads PRD and progress log (memory)
3. Implements one user story
4. Runs tests, commits, updates PRD
5. Logs learnings for future iterations

### Quick Start

```bash
# Inside the container
cd /workspace

# Create your PRD (copy and edit the template)
cp .ai-dev/prd-template.json prd.json
# Edit prd.json with your stories

# Run Ralph (default 10 iterations)
.ai-dev/ralph.sh

# Or specify max iterations
.ai-dev/ralph.sh 20

# Or use custom prompt
.ai-dev/ralph.sh 10 /path/to/custom-prompt.md
```

### Files

| File | Purpose |
|------|---------|
| `ralph.sh` | Main loop script |
| `ralph-prompt.md` | Instructions sent to Claude each iteration |
| `prd-template.json` | Template for your PRD |
| `prd.json` | Your project's PRD (in repo root) |
| `progress.txt` | Learnings log (created automatically) |

### PRD Format

```json
{
  "name": "Feature Name",
  "branch": "feature/my-feature",
  "stories": [
    {
      "id": "STORY-1",
      "title": "User story title",
      "description": "As a user, I want to...",
      "priority": 1,
      "passes": false,
      "acceptance_criteria": ["..."]
    }
  ]
}
```

### Customizing the Prompt

Edit `.ai-dev/ralph-prompt.md` to change Claude's behavior. Key sections:
- Task workflow
- Progress log format
- Completion criteria

### Tips

- **Small stories**: Each story should be implementable in one context window
- **Good tests**: Ralph relies on tests to verify completion
- **Check progress.txt**: See what Claude learned across iterations
- **Archive on branch switch**: Progress is auto-archived when you change branches

## Security Notes

- **SSL Inspection**: The proxy performs MITM on HTTPS traffic to inspect URLs. This is required for path-based filtering but means all traffic is decrypted by the proxy.
- **Network Isolation**: The Claude container has no direct internet access - all traffic must go through the proxy.
- **Volume Mounts**: The container has read/write access to your mounted directories. Be mindful of what you mount.
