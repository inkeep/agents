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
