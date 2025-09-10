# Workflow Scripts

This directory contains scripts for analyzing and optimizing GitHub Actions workflows.

## Available Scripts

### profile.mjs
Performance profiling tool for GitHub Actions workflows.

**Usage:**
```bash
# Profile all workflows
pnpm workflow:profile

# Profile with detailed step analysis
pnpm workflow:profile:verbose

# Profile specific workflow
node scripts/workflows/profile.mjs --workflow "Test"

# Analyze specific number of runs
node scripts/workflows/profile.mjs --limit 30

# Combine options
node scripts/workflows/profile.mjs --workflow "Publish" --limit 20 --verbose
```

**Features:**
- Analyzes workflow run times and identifies bottlenecks
- Shows job and step-level performance metrics
- Provides optimization recommendations
- Tracks success rates and trends
- Identifies slow artifact operations, build steps, and tests

**Options:**
- `--limit <number>`: Number of workflow runs to analyze (default: 10)
- `--workflow <name>`: Filter by workflow name (partial match supported)
- `--verbose`: Show detailed step-by-step analysis

## Future Scripts

Additional workflow-related scripts can be added here:
- `optimize.mjs` - Automatically generate optimized workflow files
- `monitor.mjs` - Real-time workflow monitoring
- `cost-analysis.mjs` - Estimate GitHub Actions costs
- `dependency-graph.mjs` - Visualize job dependencies
- `benchmark.mjs` - Compare workflow performance over time

## Requirements

- GitHub CLI (`gh`) must be installed and authenticated
- Node.js 18+ required
- Repository must have workflow run history

## Installation

```bash
# Ensure GitHub CLI is installed
brew install gh  # macOS
# or
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh  # Ubuntu/Debian

# Authenticate with GitHub
gh auth login
```

## Related Documentation

- [GitHub Actions Optimization Guide](../../docs/GITHUB_ACTIONS_OPTIMIZATION.md)
- [Merge Queue vs Concurrency Guide](../../docs/GITHUB_ACTIONS_MERGE_QUEUE_VS_CONCURRENCY.md)
