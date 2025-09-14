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

# Push your project
npx inkeep push

# List all graphs
npx inkeep list-graphs

# Start a chat session
npx inkeep chat
```


## Example Categories

### Agent Configurations (`/agent-configurations`)

These examples demonstrate various agent configuration patterns:

- **basic-model-example.ts** - Basic agent setup with different model settings
- **delegation-example.ts** - Agent delegation and transfer patterns
- **agent-framework-example.ts** - Complete framework usage example
- **hosted-tool-example.ts** - Using hosted tools with agents
- **credential-context-example.ts** - Managing credentials and context
- **inkeep-context-example.ts** - Inkeep-specific context handling
- **model-configuration-example.ts** - Advanced model settings options

### Graph Configurations

Complete graph examples ready to be pushed:

- **graph.graph.ts** - Basic graph configuration
- **board-of-directors.graph.ts** - Multi-agent collaborative graph
- **slack.graph.ts** - Slack integration example
- **zendesk.graph.ts** - Zendesk integration example
- **multi-turn.graph.ts** - Multi-turn conversation handling
- **inter-graph-communication.graph.ts** - Communication between graphs

### Tool Configurations (`/tool-configurations`)

Examples of custom tool implementations and MCP server configurations.

### MCP Servers (`/mcp-servers`)

Examples of Model Context Protocol server configurations.

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
├── .env                     # API keys and optional integrations
├── .env.example             # Example environment variables
├── agent-configurations/    # Agent and graph examples
├── tool-configurations/     # Custom tool examples
└── mcp-servers/            # MCP server configurations
```

## Development Workflow

1. **Create a new graph configuration**:
   ```typescript
   // my-graph.graph.ts
   import { agent, agentGraph } from '@inkeep/agent-framework';
   
   const myAgent = agent({
     id: 'my-agent',
     name: 'My Agent',
     prompt: 'You are a helpful assistant',
     // No tenantId needed - CLI will inject it from inkeep.config.ts
   });
   
   export const graph = agentGraph({
     id: 'my-graph',
     name: 'My Graph',
     defaultAgent: myAgent,
     agents: [myAgent],
     // No tenantId or apiUrl needed - CLI will inject them
   });
   // No graph.init() call - CLI handles initialization
   ```

2. **Push the project**:
   ```bash
   npx inkeep push
   ```

3. **Test with chat**:
   ```bash
   npx inkeep chat my-graph
   ```

## Tips

- All examples use the `@inkeep/agents-manage-api/builders` package from the workspace
- The CLI is available as `@inkeep/agents-cli` in devDependencies
- The CLI handles TypeScript compilation automatically when pushing graphs
- Check individual example files for specific usage instructions

## Contributing

When adding new examples:

1. Place them in the appropriate subdirectory
2. Use the package imports: `import { ... } from '@inkeep/agents-manage-api/builders'`
3. Add a script to `package.json` if it's a runnable example
4. Include comments explaining the example's purpose and usage
5. Test that the example works with the current framework version

## License

See the main repository LICENSE file.