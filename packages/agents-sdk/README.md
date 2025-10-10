# @inkeep/agents-sdk

SDK for building and managing agents in the Inkeep Agent Framework.

## Installation

```bash
npm install @inkeep/agents-sdk
```

## Usage

```typescript
import { agent, agentGraph, tool } from '@inkeep/agents-sdk';

// Create an agent
const myAgent = agent({
  id: 'my-agent',
  name: 'My Agent',
  description: 'A helpful agent',
  instructions: 'You are a helpful assistant.',
});

// Create a graph
export const graph = agentGraph({
  id: 'my-graph',
  name: 'My Graph',
  description: 'My agent graph',
  defaultSubAgent: myAgent,
  subAgents: () => [myAgent],
});
```

## API Reference

### Builders

- `agent()` - Create an agent configuration
- `agentGraph()` - Create an agent graph
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
