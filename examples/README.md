# Inkeep Agent Framework Examples

This package contains example configurations and usage patterns for the Inkeep Agent Framework.

## Getting Started

### Installation

From the root of the monorepo:

```bash
pnpm install
```

### Configuration

The examples directory includes an `inkeep.config.ts` file with default settings:

- Tenant ID: `example-tenant`
- API URL: `http://localhost:3002`

To use your own configuration, either:

1. Edit the `inkeep.config.ts` file directly
2. Or run `npx inkeep init` to create your own configuration

## Running Examples

### Using the Inkeep CLI

The examples package includes the Inkeep CLI as a dev dependency. From the examples directory:

```bash
# Initialize your configuration
npx inkeep init

# Push your project (deploys all graphs to the Inkeep platform)
npx inkeep push

# List all graphs
npx inkeep list-graphs

# Start a chat session
npx inkeep chat
```

## Example Categories

### Graph Configurations (`/graphs`)

Complete graph examples ready to be pushed to the Inkeep platform:

- **basic.graph.ts** - Basic multi-agent graph with hello/goodbye agents
- **weather-graph.graph.ts** - Weather assistant with MCP tools for geocoding and forecasting

### Environment Configurations (`/environments`)

Environment-specific settings and credential management:

- **development.env.ts** - Development environment configuration
- **development.validation.ts** - Environment variable validation
- **production.env.ts** - Production environment configuration
- **production.validation.ts** - Production environment validation

## Environment Variables

Create a `.env` file in the examples directory for API keys and optional integrations:

```env
# Required for AI models
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key  # Optional

# Optional integrations
INKEEP_API_KEY=your-inkeep-api-key  # For Inkeep search/context features
NANGO_SECRET_KEY=your-nango-key     # For credential management
SLACK_MCP_URL=http://localhost:3001 # For Slack MCP examples
```

Note: Tenant ID and API URL are configured in `inkeep.config.ts`, not via environment variables.

## Project Structure

```
examples/
├── package.json              # Package configuration with CLI dependency
├── inkeep.config.ts         # Inkeep configuration (tenant ID, API URL)
├── index.ts                 # Main entry point
├── tsconfig.json           # TypeScript configuration
├── graphs/                  # Graph configuration examples
│   ├── basic.graph.ts      # Basic multi-agent example
│   └── weather-graph.graph.ts # Weather assistant example
└── environments/            # Environment configurations
    ├── development.env.ts  # Development environment settings
    ├── development.validation.ts # Development validation
    ├── production.env.ts   # Production environment settings
    └── production.validation.ts # Production validation
```

## Development Workflow

1. **Create a new graph configuration**:

   ```typescript
   // graphs/my-graph.graph.ts
   import { agent, agentGraph } from "@inkeep/agents-sdk";

   const myAgent = agent({
     id: "my-agent",
     name: "My Agent",
     prompt: "You are a helpful assistant",
     // No tenantId needed - CLI will inject it from inkeep.config.ts
   });

   export const myGraph = agentGraph({
     id: "my-graph",
     name: "My Graph",
     defaultSubAgent: myAgent,
     agents: () => [myAgent],
     // No tenantId or apiUrl needed - CLI will inject them
   });
   // No graph.init() call - CLI handles initialization
   ```

2. **Push the project** (deploys all graphs to the Inkeep platform):

   ```bash
   npx inkeep push
   ```

3. **Test with chat**:
   ```bash
   npx inkeep chat my-graph
   ```

## Tips

- All examples use the `@inkeep/agents-sdk` package from the workspace
- The CLI is available as `@inkeep/agents-cli` in devDependencies
- The CLI handles TypeScript compilation automatically when pushing graphs
- Environment configurations are managed through the `/environments` directory
- Check individual example files for specific usage instructions

## Contributing

When adding new examples:

1. Place graph examples in the `/graphs` directory
2. Place environment configurations in the `/environments` directory
3. Use the package imports: `import { ... } from '@inkeep/agents-sdk'`
4. Include comments explaining the example's purpose and usage
5. Test that the example works with the current framework version

## License

See the main repository LICENSE file.
