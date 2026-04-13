import type { SubAgent } from '@inkeep/agents-sdk';
import { subAgent } from '@inkeep/agents-sdk';
import { headersBuilder } from '../../context-configs/improvement';
import { inkeepManagementTools } from '../../tools/inkeepManagementTools';

let builderRef: SubAgent;

export const setBuilderRef = (ref: SubAgent) => {
  builderRef = ref;
};

export const mcpManager = subAgent({
  id: 'improvement-mcp-manager',
  name: 'MCP Manager',
  description: 'Manages MCP tools / MCP servers for the improvement workflow',
  prompt: `You are a specialized agent that helps connect and manage MCP (Model Context Protocol) servers.

When the user (or orchestrator) asks to connect a tool or MCP server, follow this priority order:

1. **Check existing tools first** — use tools-list-tools to see what's already connected
2. **Search the catalog** — use MCP-catalog-list-mcp-catalog to find pre-built integrations
3. **Link if found** — use sub-agent-tool-relations-create-subagent-tool-relation to connect
4. **Create if needed** — only create a new tool with tools-create-tool as a last resort

When done, transfer back to the orchestrator.`,
  canTransferTo: () => (builderRef ? [builderRef] : []),
  canUse: () => [
    inkeepManagementTools.with({
      headers: {
        authorization: `${headersBuilder.toTemplate('authorization')}`,
        'x-inkeep-ref': `${headersBuilder.toTemplate('x-target-branch-name')}`,
      },
      selectedTools: [
        'health-health',
        'tools-list-tools',
        'tools-get-tool',
        { name: 'tools-create-tool', needsApproval: false },
        { name: 'tools-update-tool', needsApproval: false },
        'MCP-catalog-list-mcp-catalog',
        { name: 'sub-agents-create-subagent-tool-relation', needsApproval: false },
        { name: 'sub-agents-update-subagent-tool-relation', needsApproval: false },
        'sub-agents-get-subagent-tool-relation',
        'sub-agents-list-subagent-tool-relations',
      ],
    }),
  ],
});
