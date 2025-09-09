# Switching Between Local and Published Inkeep CLI Versions

## ENVIRONMENT Variable (Now Optional!)

The `inkeep` CLI uses the `ENVIRONMENT` variable from `@inkeep/agents-core`. After the recent fix, the CLI now automatically detects the appropriate default:
- **Published/Global Install**: Defaults to `production`
- **Local Development**: Defaults to `development`

You can still explicitly set `ENVIRONMENT` if needed for specific use cases (`test`, `pentest`, etc.).

## Quick Commands

### Using Published Version (npm)
```bash
# Install if not already installed
npm install -g @inkeep/agents-cli@latest

# Run (no ENVIRONMENT needed after the fix!)
inkeep --version
inkeep push agent-configurations/graph.graph.ts

# Or explicitly set environment if needed
ENVIRONMENT=production inkeep push agent-configurations/graph.graph.ts
```

### Using Local Development Version (current directory)
```bash
# Build the local version first
cd /path/to/your/agents-repo/agents-cli
pnpm build

# Run directly with node (auto-detects as development)
node ./dist/index.js --version
node ./dist/index.js push ../examples/agent-configurations/graph.graph.ts

# Or use the provided wrapper script
/path/to/your/agents-repo/scripts/inkeep-local.sh --version

# Or explicitly set environment if needed
ENVIRONMENT=test node ./dist/index.js push ../examples/agent-configurations/graph.graph.ts
```

## Creating Convenient Aliases

Add these to your shell configuration file (`~/.zshrc` or `~/.bashrc`):

```bash
# Published version - always uses npm global install
alias inkeep-published='npx @inkeep/agents-cli@latest'

# Local version - uses the CLI from current working directory if in a repo
function inkeep-local() {
  # Search for agents-cli directory in current path or parent directories
  local search_dir=$(pwd)
  local cli_path=""
  
  while [[ "$search_dir" != "/" ]]; do
    if [[ -f "$search_dir/agents-cli/dist/index.js" ]]; then
      cli_path="$search_dir/agents-cli/dist/index.js"
      break
    elif [[ -f "$search_dir/dist/index.js" && -f "$search_dir/package.json" ]]; then
      # Check if we're directly in agents-cli directory
      if grep -q '"name": "@inkeep/agents-cli"' "$search_dir/package.json" 2>/dev/null; then
        cli_path="$search_dir/dist/index.js"
        break
      fi
    fi
    search_dir=$(dirname "$search_dir")
  done
  
  if [[ -n "$cli_path" ]]; then
    echo "Using local CLI from: $cli_path"
    node "$cli_path" "$@"
  else
    echo "No local agents-cli found in current directory tree"
    echo "Falling back to global installation"
    inkeep "$@"
  fi
}

# Quick switcher - defaults to local if available
alias inkeep='inkeep-local'
```

## Using npx for Testing Different Versions

```bash
# Test specific published version
npx @inkeep/agents-cli@0.1.1 --version

# Test latest published version
npx @inkeep/agents-cli@latest --version

# Force fresh download (bypass cache)
npx --no @inkeep/agents-cli@latest --version
```

## Development Workflow

### When Working on Multiple Repositories

If you have multiple copies of the repository:

```bash
# In agents-4 directory
cd ~/Documents/code/agents/agents-4
inkeep-local push examples/agent-configurations/graph.graph.ts  # Uses agents-4's CLI

# In agents-3 directory  
cd ~/Documents/code/agents/agents-3
inkeep-local push examples/agent-configurations/graph.graph.ts  # Uses agents-3's CLI

# Anywhere else
cd ~/some/other/directory
inkeep-local --version  # Falls back to global or shows error
```

### Building Local Version

Always rebuild after making changes:

```bash
cd agents-cli
pnpm build
# Now the local version will use your latest changes
```

## Environment Variable Options

- `development` - For local development, disables some security checks
- `production` - For production use, all security enabled
- `test` - For running tests
- `pentest` - For penetration testing scenarios

## Troubleshooting

### If you get "ENVIRONMENT is required" error
This should no longer happen after the fix in `packages/agents-core/src/env.ts`. If you're still seeing this error:
1. Make sure you've rebuilt the packages: `pnpm build`
2. For older versions, prefix commands with `ENVIRONMENT=<value>`:
```bash
ENVIRONMENT=production inkeep --version
```

### If local version isn't found
1. Check you're in a repository with agents-cli
2. Ensure the CLI is built: `cd agents-cli && pnpm build`
3. Check the dist file exists: `ls agents-cli/dist/index.js`

### To permanently set ENVIRONMENT
Add to your shell config:
```bash
export ENVIRONMENT=development  # or production
```

But this isn't recommended as different repos might need different environments.