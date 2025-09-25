# Inkeep CLI

A command-line interface for managing and interacting with Inkeep Agent Framework graphs.

## Installation & Setup

### Prerequisites

- Node.js >= 20.x
- pnpm package manager
- Inkeep Agent Framework backend running (default: http://localhost:3002)

### Quick Start

> **📖 For detailed setup instructions, see [SETUP.md](./SETUP.md)**

1. **Install and build**

   ```bash
   # Navigate to the CLI directory
   cd /path/to/agent-framework/agents-cli

   # Install dependencies
   pnpm install

   # Build the CLI
   pnpm build
   ```

2. **Install globally** (recommended)

   **Option A: Using npm link (for development)**

   ```bash
   # Create global symlink from the agents-cli directory
   npm link

   # Verify installation
   which inkeep  # Should show path to inkeep command
   ```

   **Option B: Using pnpm/npm global install (after publishing)**

   ```bash
   # Install the scoped package globally
   pnpm add -g @inkeep/agents-cli
   # or
   npm install -g @inkeep/agents-cli

   # Verify installation
   inkeep --version
   ```

   **Note:**

   - For local development, use `npm link` (more reliable than `pnpm link --global`)
   - The command is still `inkeep` even though the package name is `@inkeep/agents-cli`
   - If linking fails, try unlinking first: `npm unlink -g @inkeep/agents-cli`

3. **Configure your project**

   ```bash
   # Create an inkeep.config.ts file with your tenant ID
   inkeep init

   # Or manually create inkeep.config.ts:
   # export default defineConfig({
   #   tenantId: "your-tenant-id",
   #   projectId: "your-project-id",
   #   agentsManageApiUrl: "http://localhost:3002",
   #   agentsRunApiUrl: "http://localhost:3003"
   # });
   ```

## Configuration

### Configuration Sources (priority order)

1. **Command-line flags** - Highest priority (e.g., `--tenant-id`, `--agents-manage-api-url`, `--config`)
2. **Config file** - `inkeep.config.ts` (or file specified with `--config`)
3. **Environment variables** - `INKEEP_AGENTS_MANAGE_API_URL`, `INKEEP_AGENTS_RUN_API_URL`
4. **Defaults** - Lowest priority (defaults to `http://localhost:3002` and `http://localhost:3003`)

### Config File Options

Most commands support the `--config` option to specify a custom configuration file:

```bash
# Use custom config file
inkeep list-graphs --project my-project --config ./staging-config.ts

# Backward compatibility (deprecated)
inkeep list-graphs --project my-project --config-file-path ./staging-config.ts
```

### Environment Variables

Create a `.env` file in your project directory:

```bash
INKEEP_AGENTS_MANAGE_API_URL=http://localhost:3002
INKEEP_AGENTS_RUN_API_URL=http://localhost:3003
```

Or export them in your shell:

```bash
export INKEEP_AGENTS_MANAGE_API_URL=http://localhost:3002
export INKEEP_AGENTS_RUN_API_URL=http://localhost:3003
```

## Commands

### `inkeep add [template]`

Add a new template to the project.

```bash
# Add a template
inkeep add my-template

# Add template to specific path
inkeep add my-template --target-path ./src/templates

# Using config file
inkeep add my-template --config ./my-config.ts
```

### `inkeep init [path]`

Initialize a new Inkeep configuration file.

```bash
# Interactive initialization
inkeep init

# Initialize in specific directory
inkeep init ./my-project

# Skip interactive prompts
inkeep init --no-interactive

# Use existing config as template
inkeep init --config ./template-config.ts
```

### `inkeep config`

Manage Inkeep configuration values.

```bash
# Get configuration value
inkeep config get tenantId

# Set configuration value
inkeep config set tenantId my-tenant-id

# List all configuration values
inkeep config list

# Using specific config file
inkeep config get tenantId --config ./my-config.ts
```

### `inkeep pull`

Pull entire project configuration from backend and update local files.

```bash
# Pull current project
inkeep pull

# Pull specific project
inkeep pull --project my-project-id

# Generate environment file
inkeep pull --env production

# Generate JSON file instead of updating files
inkeep pull --json

# Enable debug logging
inkeep pull --debug

# Using config file
inkeep pull --project my-project-id --config ./my-config.ts
```

### `inkeep dev`

Start the Inkeep dashboard server or build for production.

```bash
# Start development server
inkeep dev

# Start on custom port and host
inkeep dev --port 3001 --host 0.0.0.0

# Build for production
inkeep dev --build --output-dir ./build

# Get dashboard path for deployment
DASHBOARD_PATH=$(inkeep dev --path)
echo "Dashboard built at: $DASHBOARD_PATH"

# Use with Vercel
vercel --cwd $(inkeep dev --path) -Q .vercel build

# Use with Docker
docker build -t inkeep-dashboard $(inkeep dev --path)

# Use with other deployment tools
rsync -av $(inkeep dev --path)/ user@server:/var/www/dashboard/
```

### `inkeep tenant [tenant-id]` ⚠️ NOT IMPLEMENTED

> **⚠️ WARNING: This command is not yet implemented in the current CLI.**
> Use `inkeep.config.ts` to set your tenant ID instead.

Manage tenant configuration.

```bash
# Set tenant ID
inkeep tenant my-tenant

# View current tenant ID
inkeep tenant
```

### `inkeep list-graphs`

List all available graphs for a specific project.

```bash
# List graphs for a project (required)
inkeep list-graphs --project my-project-id

# With custom API URL
inkeep list-graphs --project my-project-id --agents-manage-api-url http://api.example.com:3002

# With custom tenant ID
inkeep list-graphs --project my-project-id --tenant-id my-tenant-id

# Using config file
inkeep list-graphs --project my-project-id --config ./my-config.ts
```

Output:

```
┌─────────────────────────┬────────────────────┬───────────────┬───────────┐
│ Graph ID                │ Name               │ Default Agent │ Created   │
├─────────────────────────┼────────────────────┼───────────────┼───────────┤
│ customer-support-graph  │ Customer Support   │ router        │ 1/15/2025 │
│ qa-assistant           │ QA Assistant       │ qa-agent      │ 1/14/2025 │
└─────────────────────────┴────────────────────┴───────────────┴───────────┘
```

### `inkeep push`

Push your project configuration to the backend.

```bash
# Push the current project (from the directory with inkeep.config.ts)
inkeep push

# Push specific project
inkeep push --project my-project-id

# With custom configuration
inkeep push --project my-project-id --config ./my-config.ts

# With custom API URLs
inkeep push --project my-project-id --agents-manage-api-url http://manage.example.com --agents-run-api-url http://run.example.com

# With custom tenant ID
inkeep push --project my-project-id --tenant-id my-tenant-id
```

**Features:**

- Automatically injects tenant ID and API URL from `inkeep.config.ts`
- Validates exactly one AgentGraph is exported
- Warns about dangling resources (unreferenced agents/tools)
- Shows graph summary after successful push
- Handles graph initialization automatically

**Graph files:** Define your graphs in your project (e.g., `graphs/*.graph.ts`). The CLI pushes the project containing those graphs.

**Example graph configuration:**

```javascript
// customer-support.graph.ts
import { agent, agentGraph, tool } from "@inkeep/agents-manage-api/builder";

const assistantAgent = agent({
  id: "assistant",
  name: "Assistant",
  instructions: "Help users with their questions",
  tools: {
    search: searchTool,
  },
  // No tenantId needed - injected by CLI
});

// Must export exactly one graph
export const graph = agentGraph({
  id: "my-assistant",
  name: "My Assistant Graph",
  defaultAgent: assistantAgent,
  agents: {
    assistant: assistantAgent,
  },
  // No tenantId or apiUrl needed - CLI injects from config
});
// No graph.init() call - CLI handles initialization
```

### `inkeep chat [graph-id]`

Start an interactive chat session with a graph.

```bash
# Chat with specific graph
inkeep chat my-graph-id

# Interactive graph selection (with search)
inkeep chat

# With custom API URLs
inkeep chat --agents-manage-api-url http://manage.example.com --agents-run-api-url http://run.example.com

# With custom tenant ID
inkeep chat --tenant-id my-tenant-id

# Using config file
inkeep chat --config ./my-config.ts
```

**Interactive Features:**

- **Graph selection**: If no graph ID provided, shows searchable list
- **Chat commands**:
  - `help` - Show available commands
  - `clear` - Clear screen (preserves context)
  - `history` - Show conversation history
  - `reset` - Reset conversation context
  - `exit` - End chat session

### `inkeep mcp start <graph-file>` ⚠️ NOT IMPLEMENTED

> **⚠️ WARNING: This command is not yet implemented in the current CLI.**
> MCP functionality is planned but not available in the current version.

Start MCP (Model Context Protocol) servers defined in a graph file.

```bash
# Start MCP servers from a TypeScript graph file
inkeep mcp start examples/agent-configurations/graph.graph.ts

# Start from compiled JavaScript
inkeep mcp start dist/examples/agent-configurations/graph.graph.js

# Run in detached mode
inkeep mcp start graph.graph.ts --detached

# Show verbose output
inkeep mcp start graph.graph.ts --verbose
```

**Features:**

- Supports both TypeScript (`.ts`) and JavaScript (`.js`) files
- Automatically allocates ports for local servers (3100-3200)
- Shows server names, ports, and URLs
- Distinguishes between local (🏠) and remote (☁️) servers

### `inkeep mcp stop` ⚠️ NOT IMPLEMENTED

> **⚠️ WARNING: This command is not yet implemented in the current CLI.**

Stop running MCP servers.

```bash
# Stop all servers
inkeep mcp stop --all

# Stop servers for a specific graph
inkeep mcp stop --graph customer-support-graph
```

### `inkeep mcp status` ⚠️ NOT IMPLEMENTED

> **⚠️ WARNING: This command is not yet implemented in the current CLI.**

Show status of all MCP servers.

```bash
inkeep mcp status
```

Output shows:

- Process ID
- Graph ID
- Tool name
- Port/URL
- Running status
- Uptime

### `inkeep mcp list` ⚠️ NOT IMPLEMENTED

> **⚠️ WARNING: This command is not yet implemented in the current CLI.**

List all MCP servers with detailed information.

```bash
# Default tree view
inkeep mcp list

# Table format
inkeep mcp list --format table

# Verbose output (includes descriptions)
inkeep mcp list --verbose
```

## Complete Workflow Example

### Basic Setup

```bash
# Install and link CLI
cd agents-cli
pnpm install
pnpm build
npm link

# Initialize configuration
inkeep init
# Edit inkeep.config.ts to set your tenantId and projectId
```

### Working with Graphs and MCP Servers ⚠️ NOT AVAILABLE

> **⚠️ WARNING: MCP commands shown below are not yet implemented.**
> This section shows planned functionality that is not available in the current version.

1. **Create a graph with MCP tools** (`my-graph.graph.ts`)

```typescript
import {
  agent,
  agentGraph,
  mcpServer,
} from "@inkeep/agents-manage-api/builder";

// Define MCP servers (tools)
const randomNumberServer = mcpServer({
  name: "random_number",
  description: "Generates a random number",
  execute: async () => Math.random(),
});

const weatherServer = mcpServer({
  name: "weather_api",
  description: "Get weather information",
  serverUrl: "https://api.weather.example.com/mcp",
});

// Define agents
const assistantAgent = agent({
  id: "assistant",
  name: "Assistant",
  instructions: "Help users with various tasks",
  tools: {
    random: randomNumberServer,
    weather: weatherServer,
  },
});

// Export the graph
export const graph = agentGraph({
  id: "my-assistant",
  name: "My Assistant",
  defaultAgent: assistantAgent,
  agents: { assistant: assistantAgent },
});

// Export servers for MCP management
export const servers = [randomNumberServer, weatherServer];
```

2. **Start MCP servers and chat**

```bash
# Start MCP servers (works with TypeScript directly!)
inkeep mcp start my-graph.graph.ts

# In another terminal, start chatting
inkeep chat my-assistant

# Try commands like:
# > "Generate a random number"
# > "What's the weather like?"
```

3. **Monitor and manage servers**

```bash
# Check server status
inkeep mcp status

# List all servers with details
inkeep mcp list

# Stop servers when done
inkeep mcp stop --all
```

## Working with Different Environments

### Development

```bash
# Using environment variables
INKEEP_AGENTS_MANAGE_API_URL=http://localhost:3002 inkeep list-graphs

# Using .env file
echo "INKEEP_AGENTS_MANAGE_API_URL=http://localhost:3002" > .env
echo "INKEEP_AGENTS_RUN_API_URL=http://localhost:3003" >> .env
inkeep chat my-graph
```

### Staging

```bash
# Set in config file
# Edit your inkeep.config.ts:
# agentsManageApiUrl: 'https://staging-manage-api.example.com'
# agentsRunApiUrl: 'https://staging-run-api.example.com'
```

### Production

```bash
# Using environment variables
export INKEEP_AGENTS_MANAGE_API_URL=https://manage-api.example.com
export INKEEP_AGENTS_RUN_API_URL=https://run-api.example.com
inkeep list-graphs
```

## Development

### Running from Source

```bash
# Without building (using tsx)
pnpm tsx src/index.ts <command>

# After building
node dist/index.js <command>

# Watch mode (auto-rebuild on changes)
pnpm dev
```

### Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Type Checking

```bash
pnpm typecheck
```

### Project Structure

```
agents-cli/
├── src/
│   ├── index.ts              # Main CLI entry point
│   ├── config.ts             # Configuration management
│   ├── api.ts                # API client for backend
│   ├── commands/             # Command implementations
│   │   ├── push.ts           # Push graph configurations
│   │   ├── chat.ts           # Basic chat interface
│   │   ├── chat-enhanced.ts  # Enhanced chat with autocomplete
│   │   ├── tenant.ts         # Tenant management
│   │   └── list-graphs.ts    # List graphs
│   ├── types/                # TypeScript declarations
│   └── __tests__/            # Test files
├── dist/                     # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### Common Issues

**"Failed to fetch graphs" or connection errors**

```bash
# Check if backend is running
curl http://localhost:3002/health

# Verify API URLs
echo $INKEEP_AGENTS_MANAGE_API_URL
echo $INKEEP_AGENTS_RUN_API_URL

# Try with explicit URL and project
inkeep list-graphs --project my-project-id --agents-manage-api-url http://localhost:3002
```

**"Graph not found" when using chat**

```bash
# List available graphs first (requires project)
inkeep list-graphs --project my-project-id

# Use interactive selection
inkeep chat
# (Select from list)
```

**Command not found: inkeep**

```bash
# Ensure CLI is linked globally
cd agents-cli
npm link

# Or if published, install globally
pnpm add -g @inkeep/agents-cli
# or
npm install -g @inkeep/agents-cli

# Or add to PATH manually (for development)
export PATH="$PATH:/path/to/agents-cli/dist"
```

## Dependencies

### Runtime Dependencies

- **commander**: Command-line framework
- **chalk**: Terminal styling
- **dotenv**: Environment variable loading
- **ora**: Loading spinners
- **cli-table3**: Table formatting
- **inquirer**: Interactive prompts
- **inquirer-autocomplete-prompt**: Searchable selections

### Development Dependencies

- **typescript**: TypeScript compiler
- **@types/node**: Node.js types
- **vitest**: Testing framework
- **@vitest/coverage-v8**: Coverage reporting

## Requirements

- Node.js >= 20.x
- pnpm package manager
- TypeScript 5.x
- Inkeep Agent Framework backend

## License

MIT
