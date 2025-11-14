#!/bin/bash

# Start Firecrawl MCP proxy server
# This converts the stdio-based firecrawl-mcp to HTTP/SSE transport
# so it can be used with the Inkeep Visual Builder

echo "🔥 Starting Firecrawl MCP Proxy on port 4000..."
echo "📝 Make sure you have mcp-proxy installed: npm install -g mcp-proxy"
echo ""

# Set the Firecrawl API key
export FIRECRAWL_API_KEY="fc-a714655fe4e94a0086be8c2c7d5bf759"

# Start the proxy
mcp-proxy --port 4000 --shell "npx -y firecrawl-mcp"


