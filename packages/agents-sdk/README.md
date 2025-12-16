# @inkeep/agents-sdk

SDK for building and managing agents in the Inkeep Agent Framework.

## Installation

```bash
npm install @inkeep/agents-sdk
```

## Usage

```typescript
import { agent, subAgent, tool } from '@inkeep/agents-sdk';

// Create a sub-agent
const mySubAgent = subAgent({
  id: 'my-sub-agent',
  name: 'My Sub Agent',
  description: 'A helpful sub-agent',
  prompt: 'You are a helpful assistant.',
});

// Create an agent
export const myAgent = agent({
  id: 'my-agent',
  name: 'My Agent',
  description: 'My agent',
  defaultSubAgent: mySubAgent,
  subAgents: () => [mySubAgent],
});
```

## Credential Management

The SDK provides a clean abstraction for credential management through `InkeepCredentialProvider`:

```typescript
import { InkeepCredentialProvider, createCredentialProvider } from '@inkeep/agents-sdk';

// Simple memory-based storage (default)
const credentials = new InkeepCredentialProvider();

// Or use the factory function
const credentials = createCredentialProvider({ type: 'memory' });

// Store and retrieve credentials
await credentials.set('my-api-key', 'secret-value');
const key = await credentials.get('my-api-key');

// Environment variables are automatically available
process.env.MY_TOKEN = 'env-token';
const token = await credentials.get('MY_TOKEN'); // Returns 'env-token'
```

### Credential Provider Types

| Type | Description | Requirements |
|------|-------------|--------------|
| `memory` | In-memory storage with env var fallback | None (default) |
| `keychain` | OS keychain storage | `keytar` package |
| `nango` | OAuth credential management | `@nangohq/node`, `@nangohq/types` |
| `custom` | Your own implementation | Implement `CredentialStore` interface |

### Advanced: Nango Integration

For OAuth-based credentials (requires optional packages):

```bash
npm install @nangohq/node @nangohq/types
```

```typescript
const credentials = new InkeepCredentialProvider({
  type: 'nango',
  secretKey: process.env.NANGO_SECRET_KEY,
});
```

## Telemetry

Telemetry is **opt-in** and disabled by default. The SDK provides abstractions for custom telemetry backends:

```typescript
import {
  InkeepTelemetryProvider,
  createConsoleTelemetryProvider,
  createOpenTelemetryProvider,
} from '@inkeep/agents-sdk';

// No-op (default - no telemetry overhead)
const telemetry = new InkeepTelemetryProvider();

// Console-based logging (for development)
const telemetry = createConsoleTelemetryProvider('my-agent');

// OpenTelemetry (requires @opentelemetry packages)
const telemetry = await createOpenTelemetryProvider({
  serviceName: 'my-agent',
  endpoint: 'http://localhost:4318',
});

// Use the tracer
const tracer = telemetry.getTracer('my-component');
tracer.startActiveSpan('my-operation', (span) => {
  span.setAttribute('key', 'value');
  // ... your code
  span.end();
});
```

### Telemetry Provider Types

| Provider | Description | Requirements |
|----------|-------------|--------------|
| `NoOpTelemetryProvider` | Does nothing (default) | None |
| `ConsoleTelemetryProvider` | Logs to console | None |
| Custom OpenTelemetry | Full observability | `@opentelemetry/*` packages |

## API Reference

### Builders

- `agent()` - Create an agent (top-level container with multiple sub-agents)
- `subAgent()` - Create a sub-agent configuration
- `tool()` - Create a tool configuration
- `mcpServer()` - Create an MCP server configuration
- `mcpTool()` - Create an MCP tool
- `dataComponent()` - Create a data component
- `artifactComponent()` - Create an artifact component
- `externalAgent()` - Create an external agent reference
- `transfer()` - Create a transfer configuration

### Classes

- `Agent` - Agent class for runtime operations
- `AgentGraph` - Graph management and operations
- `Tool` - Base tool class
- `Runner` - Graph execution runner

### Credential Management

- `InkeepCredentialProvider` - Main credential provider class
- `createCredentialProvider()` - Factory function for creating providers

### Telemetry

- `InkeepTelemetryProvider` - Main telemetry provider class
- `createNoOpTelemetryProvider()` - Create disabled telemetry
- `createConsoleTelemetryProvider()` - Create console-based telemetry
- `createOpenTelemetryProvider()` - Create OpenTelemetry-based telemetry

## Version Compatibility

This section documents how SDK versions relate to Inkeep Cloud runtime versions.

### Versioning Strategy

The SDK follows [Semantic Versioning](https://semver.org/):

- **Major versions** (X.0.0): Breaking changes to the SDK API
- **Minor versions** (0.X.0): New features, backward compatible
- **Patch versions** (0.0.X): Bug fixes, backward compatible

### SDK to Runtime Compatibility

| SDK Version | Minimum Runtime Version | Notes |
|-------------|------------------------|-------|
| 0.38.x | 0.38.0 | Current stable |

### Breaking Change Policy

1. **Deprecation Notice**: Features are marked deprecated at least one minor version before removal
2. **Migration Guide**: Breaking changes include migration documentation
3. **Runtime Compatibility**: SDK versions are tested against specific runtime versions

### Upgrade Path

When upgrading the SDK:

1. Check the [CHANGELOG](./CHANGELOG.md) for breaking changes
2. Update any deprecated API usage
3. Test with your target runtime version
4. For major upgrades, follow the migration guide

### Optional Dependencies

The SDK has minimal required dependencies. Advanced features require optional packages:

| Feature | Required Packages |
|---------|------------------|
| Nango credentials | `@nangohq/node`, `@nangohq/types` |
| Keychain storage | `keytar` |
| OpenTelemetry | `@opentelemetry/api`, `@opentelemetry/sdk-node` |

Install only what you need:

```bash
# Core SDK only (push/pull, memory credentials)
npm install @inkeep/agents-sdk

# With Nango OAuth support
npm install @inkeep/agents-sdk @nangohq/node @nangohq/types

# With OpenTelemetry
npm install @inkeep/agents-sdk @opentelemetry/api @opentelemetry/sdk-node
```
