# Inkeep CLI - Local Setup Guide

This guide provides detailed instructions for setting up the Inkeep CLI locally.

## Quick Setup (Automated)

Run the setup script for automatic installation:

```bash
cd /path/to/agent-framework/cli
./setup.sh
```

This script will:
- Check prerequisites
- Build and install the CLI
- Optionally set up tenant configuration

## Manual Setup

### Prerequisites

- Node.js >= 20.x
- pnpm package manager
- Running Inkeep backend (default: http://localhost:3002)

## Step 1: Build and Install the CLI

### Option A: Global Installation (Recommended)

```bash
# Navigate to the CLI directory
cd /path/to/agent-framework/cli

# Install dependencies
pnpm install

# Build the TypeScript code
pnpm build

# Create global symlink (use npm link, more reliable than pnpm link)
npm link
```

**Note:** If you encounter a pnpm store version error with `pnpm link --global`, use `npm link` instead.

After this, `inkeep` command will be available globally.

### Option B: Local Installation with Alias

If you prefer not to install globally, you can create an alias:

```bash
# Build the CLI
cd /path/to/agent-framework/cli
pnpm install
pnpm build

# Add alias to your shell config (~/.zshrc, ~/.bashrc, etc.)
echo "alias inkeep='node /path/to/agent-framework/cli/dist/index.js'" >> ~/.zshrc

# Reload shell
source ~/.zshrc
```

## Step 2: Verify Installation

```bash
# Check if inkeep is accessible
which inkeep

# Test the CLI
inkeep --version
```

## Step 3: Configure Tenant

Before using most commands, you need to set a tenant ID:

```bash
# Set your tenant ID
inkeep tenant test-tenant

# Verify it's set
inkeep tenant
```

## Step 4: Test Basic Commands

```bash
# List available graphs
inkeep list-graphs

# Push your project
inkeep push

# Start an interactive chat
inkeep chat my-graph-id

# Or let the CLI show you available graphs
inkeep chat
```

## Troubleshooting

### Issue: pnpm link --global fails with "Unexpected store location"

**Solution:** This happens when pnpm's global store version changes. Use `npm link` instead:

```bash
cd /path/to/agent-framework/cli
npm link
```

`npm link` is more reliable for creating global command symlinks and works regardless of pnpm store versions.

### Issue: "command not found: inkeep"

**Solution:** The `inkeep` command isn't in your PATH.

1. **Check if inkeep is linked:**
   ```bash
   which inkeep
   ```

2. **If not found, re-link:**
   ```bash
   cd /path/to/agent-framework/cli
   npm link
   ```

3. **Or check npm/pnpm global bin location:**
   ```bash
   # For npm
   npm bin -g
   
   # For pnpm
   pnpm bin -g
   ```
   
   Make sure this directory is in your PATH.

### Issue: "No tenant ID configured"

**Solution:** Set a tenant ID:

```bash
inkeep tenant your-tenant-id
```

## Environment Variables

You can also set these in your shell config or `.env` file:

```bash
# ~/.zshrc or ~/.bashrc
export INKEEP_API_URL=http://localhost:3002

# Or in .env file in your project
INKEEP_API_URL=http://localhost:3002
```

## Quick Test Commands

After setup, try these commands:

```bash
# Basic commands
inkeep --help
inkeep tenant
inkeep list-graphs

# Interactive chat
inkeep chat  # Shows list of available graphs
```

## Getting Help

If you encounter issues:

1. Check which shell you're using: `echo $SHELL`
2. Verify inkeep is in PATH: `which inkeep`
3. Try in a new terminal window
4. Check the backend is running: `curl http://localhost:3002/health`