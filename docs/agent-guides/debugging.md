# Debugging

This guide covers debugging tools and techniques for the Inkeep Agent Framework.

## Jaeger Tracing

Jaeger runs on `localhost:16686` for distributed tracing.

### Common Queries

```bash
# Get all services
curl "http://localhost:16686/api/services"

# Get operations for a service
curl "http://localhost:16686/api/operations?service=inkeep-chat"

# Recent traces (last hour)
curl "http://localhost:16686/api/traces?service=inkeep-chat&limit=20&lookback=1h"

# Traces by operation
curl "http://localhost:16686/api/traces?service=inkeep-chat&operation=agent.generate&limit=10"

# Traces by agent ID
curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22agent.id%22:%22qa-agent%22%7D&limit=10"

# Traces by conversation ID
curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22conversation.id%22:%22conv-123%22%7D"

# Get specific trace
curl "http://localhost:16686/api/traces/{trace-id}"

# Error traces
curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22error%22:%22true%22%7D&limit=10"

# Tool call traces
curl "http://localhost:16686/api/traces?service=inkeep-chat&operation=tool.call&limit=10"

# Slow operations (>5s)
curl "http://localhost:16686/api/traces?service=inkeep-chat&minDuration=5s"
```

## Common Debugging Workflows

### Agent Transfers
```bash
curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22conversation.id%22:%22conv-123%22%7D"
```

### Tool Calls
```bash
curl "http://localhost:16686/api/traces?service=inkeep-chat&operation=tool.call&limit=10"
```

### Task Delegation
```bash
curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22task.id%22:%22task-id%22%7D"
```

## Common Gotchas

- **Empty Task Messages**: Ensure task messages contain actual text content
- **Context Extraction**: For delegation, extract contextId from task ID patterns like `task_math-demo-123456-chatcmpl-789`
- **Tool Health**: MCP tools require health checks before use
- **Agent Discovery**: Agents register via `/.well-known/{subAgentId}/agent.json` endpoints



