# Inkeep Agents Run API

The Agents Run API is responsible for runtime agent operations, including Agent-to-Agent (A2A) communication, chat completions, and MCP (Model Context Protocol) tool integrations.

## Overview

This API handles the execution layer of the Inkeep Agent Framework:
- **A2A Communication**: JSON-RPC based agent-to-agent communication following Google's A2A specification
- **Chat Completions**: OpenAI-compatible chat API with multi-agent orchestration
- **MCP Integration**: Model Context Protocol tools and external integrations
- **Task Execution**: Real-time task processing and delegation workflows

## Architecture

### Core Components

- **A2A Protocol**: Agent communication via JSON-RPC methods (`tasks/send`, `tasks/get`, `tasks/cancel`)
- **Chat API**: OpenAI-compatible endpoints with agent routing and context preservation
- **MCP Tools**: Dynamic tool discovery and execution from multiple transport types (stdio, SSE, HTTP)
- **Task Management**: Hierarchical task execution with parent-child relationships

### Key Features

- **Context Preservation**: Maintains conversation state across agent transfers and delegations
- **Multi-Agent Orchestration**: Hub-and-spoke and graph-based agent networks
- **Real-time Communication**: WebSocket and HTTP-based agent interactions
- **Tool Health Monitoring**: Automated health checks for external MCP tools

## Development

### Setup
```bash
cd agents-run-api
pnpm install
```

If you do not have the database setup, run migrations from the monorepo root:
```bash
pnpm db:migrate
```


### Environment Variables
```env
ENVIRONMENT=development|production|test
PORT=3003
DB_FILE_NAME=path/to/sqlite.db
ANTHROPIC_API_KEY=required
OPENAI_API_KEY=optional
LOG_LEVEL=debug|info|warn|error
```

### Development Commands
```bash
pnpm dev              # Start development server
pnpm test             # Run test suite
pnpm test:coverage    # Run tests with coverage
pnpm build           # Build for production
pnpm lint            # Run linting
pnpm format          # Format code
```

### Testing
All tests are located in `src/__tests__/` and use Vitest with 60-second timeouts for A2A interactions.

```bash
pnpm test                    # Run all tests
pnpm test:coverage          # Run with coverage report
pnpm test src/__tests__/a2a/ # Run A2A-specific tests
```

## Configuration

The API uses environment-based configuration with defaults for local development. Key configuration areas:

- **Database**: SQLite connection via `DB_FILE_NAME`
- **AI Models**: Anthropic and OpenAI API keys
- **Observability**: OpenTelemetry tracing support
- **CORS**: Configurable for web clients

## Integration

### With Agents Manage API
The Agents Run API reads agent configurations and relationships created by the Agents Manage API but doesn't modify them during runtime.

### With MCP Tools
Supports multiple MCP transport types:
- **stdio**: Local process-based tools  
- **SSE**: Server-sent events for streaming tools
- **HTTP**: REST-based tool integrations

### With Agent Builder
Provides runtime execution for agents configured via the Agent Builder UI.

## Observability

- **Structured Logging**: JSON-formatted logs with correlation IDs
- **OpenTelemetry**: Distributed tracing for agent interactions
- **Health Checks**: Endpoint monitoring and tool availability
- **Performance Metrics**: Request timing and success rates

## Error Handling

The API implements comprehensive error handling:
- **Validation Errors**: Request schema validation
- **Agent Errors**: Agent execution failures and timeouts
- **Tool Errors**: MCP tool failures and recovery
- **Network Errors**: Resilient communication patterns

## Security

- **API Key Authentication**: Configurable authentication methods
- **Input Validation**: Request sanitization and type checking  
- **CORS**: Configurable cross-origin policies
- **Rate Limiting**: Configurable request throttling
