import { Streamdown } from 'streamdown';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

export function McpGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const mcpServerUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/v1/mcp`;
  return (
    <div className="space-y-4">
      <p>
        Use your Inkeep Agent as if was an MCP Server. Allows you to connect it to any MCP client,
        like Claude, ChatGPT, Claude and other Agents.
      </p>
      <Streamdown>
        {`Add the following configuration to your Cursor MCP settings.

\`\`\`bash
{
  "AgentName": {
    "type": "mcp",
    "url": "${mcpServerUrl}",
    "headers": {
      "Authorization": "Bearer <agent_api_key>"
    }
  }
}
\`\`\`

`}
      </Streamdown>
    </div>
  );
}
