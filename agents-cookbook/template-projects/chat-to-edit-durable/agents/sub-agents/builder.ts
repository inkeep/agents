import { subAgent } from '@inkeep/agents-sdk';
import { contextBuilder, headersBuilder } from '../../context-configs/builder';
import { inkeepManagementTools } from '../../tools/inkeepManagementTools';
import { mcpManager } from './mcp-manager';

export const builder = subAgent({
  id: 'builder',
  name: 'Builder',
  description: 'Executing tools to help build a user specified agent',
  prompt: `You are a helpful assistant that helps to build inkeep agents.
  This is the project information: ${contextBuilder.toTemplate('projectInformation')}.
  Here is a brief overview of the core concepts: ${contextBuilder.toTemplate('coreConcepts')}
  
  If you are adding a resource, make sure to connect it to the target resource too.

  However, if the user is asking about MCP servers/tools, you should transfer to the MCP Manager agent. See the section below.

## MCP Server/Tool Management

If the user wants to add / connect MCP (Model Context Protocol) servers or tools, **transfer the conversation to the MCP Manager agent**.

Examples of requests that should go to MCP Manager:
- "Add Linear to my agent"
- "Connect Slack MCP"
- "I need to integrate Jira"
- "Can you add the GitHub MCP server?"
- "Link the Notion tool to my agent"

Use the transfer command to hand off to the MCP Manager agent who specializes in MCP connections.`,
  canTransferTo: () => [mcpManager],
  canUse: () => [
    inkeepManagementTools.with({
      headers: {
        'x-forwarded-cookie': `${headersBuilder.toTemplate('x-forwarded-cookie')}`,
      },
      selectedTools: [
        // Projects
        'projects-list-projects',
        { name: 'projects-create-project', needsApproval: true },
        'projects-get-project-by-id',
        { name: 'projects-update-project', needsApproval: true },
        { name: 'projects-delete-project', needsApproval: true },
        // Sub-agents
        'sub-agent-list-subagents',
        { name: 'sub-agent-create-subagent', needsApproval: true },
        'sub-agent-get-subagent-by-id',
        { name: 'sub-agent-update-subagent', needsApproval: true },
        { name: 'sub-agent-delete-subagent', needsApproval: true },
        // Sub-agent relations
        'sub-agent-relations-list-sub-agent-relations',
        { name: 'sub-agent-relations-create-sub-agent-relation', needsApproval: true },
        'sub-agent-relations-get-sub-agent-relation-by-id',
        { name: 'sub-agent-relations-update-sub-agent-relation', needsApproval: true },
        { name: 'sub-agent-relations-delete-sub-agent-relation', needsApproval: true },
        // Sub-agent external agent relations
        'sub-agent-external-agent-relations-list-sub-agent-external-agent-relations',
        {
          name: 'sub-agent-external-agent-relations-create-sub-agent-external-agent-relation',
          needsApproval: true,
        },
        'sub-agent-external-agent-relations-get-sub-agent-external-agent-relation-by-id',
        {
          name: 'sub-agent-external-agent-relations-update-sub-agent-external-agent-relation',
          needsApproval: true,
        },
        {
          name: 'sub-agent-external-agent-relations-delete-sub-agent-external-agent-relation',
          needsApproval: true,
        },
        // Sub-agent team agent relations
        'sub-agent-team-agent-relations-list-sub-agent-team-agent-relations',
        {
          name: 'sub-agent-team-agent-relations-create-sub-agent-team-agent-relation',
          needsApproval: true,
        },
        'sub-agent-team-agent-relations-get-sub-agent-team-agent-relation-by-id',
        {
          name: 'sub-agent-team-agent-relations-update-sub-agent-team-agent-relation',
          needsApproval: true,
        },
        {
          name: 'sub-agent-team-agent-relations-delete-sub-agent-team-agent-relation',
          needsApproval: true,
        },
        // Agents
        'agents-list-agents',
        { name: 'agents-create-agent', needsApproval: true },
        'agents-get-agent',
        { name: 'agents-update-agent', needsApproval: true },
        { name: 'agents-delete-agent', needsApproval: true },
        'agent-get-related-agent-infos',
        // Subagent tool relations
        'sub-agent-tool-relations-list-subagent-tool-relations',
        { name: 'sub-agent-tool-relations-create-subagent-tool-relation', needsApproval: true },
        'sub-agent-tool-relations-get-subagent-tool-relation',
        { name: 'sub-agent-tool-relations-update-subagent-tool-relation', needsApproval: true },
        { name: 'sub-agent-tool-relations-delete-subagent-tool-relation', needsApproval: true },
        'sub-agent-tool-relations-get-subagents-for-tool',
        // Artifact component relations
        'agent-artifact-component-relations-get-artifact-components-for-agent',
        'agent-artifact-component-relations-get-agents-using-artifact-component',
        {
          name: 'agent-artifact-component-relations-associate-artifact-component-with-agent',
          needsApproval: true,
        },
        {
          name: 'agent-artifact-component-relations-remove-artifact-component-from-agent',
          needsApproval: true,
        },
        'agent-artifact-component-relations-check-artifact-component-agent-association',
        // Data component relations
        'agent-data-component-relations-get-data-components-for-agent',
        'agent-data-component-relations-get-agents-using-data-component',
        {
          name: 'agent-data-component-relations-associate-data-component-with-agent',
          needsApproval: true,
        },
        {
          name: 'agent-data-component-relations-remove-data-component-from-agent',
          needsApproval: true,
        },
        'agent-data-component-relations-check-data-component-agent-association',
        // Artifact components
        'artifact-component-list-artifact-components',
        { name: 'artifact-component-create-artifact-component', needsApproval: true },
        'artifact-component-get-artifact-component-by-id',
        { name: 'artifact-component-update-artifact-component', needsApproval: true },
        { name: 'artifact-component-delete-artifact-component', needsApproval: true },
        // Context configs
        'context-config-list-context-configs',
        { name: 'context-config-create-context-config', needsApproval: true },
        'context-config-get-context-config-by-id',
        { name: 'context-config-update-context-config', needsApproval: true },
        { name: 'context-config-delete-context-config', needsApproval: true },
        // Credentials
        'credential-list-credentials',
        { name: 'credential-create-credential', needsApproval: true },
        'credential-get-credential-by-id',
        { name: 'credential-update-credential', needsApproval: true },
        { name: 'credential-delete-credential', needsApproval: true },
        // Credential stores
        'credential-store-list-credential-stores',
        { name: 'credential-store-create-credential-in-store', needsApproval: true },
        // Data components
        'data-component-list-data-components',
        { name: 'data-component-create-data-component', needsApproval: true },
        'data-component-get-data-component-by-id',
        { name: 'data-component-update-data-component', needsApproval: true },
        { name: 'data-component-delete-data-component', needsApproval: true },
        // External agents
        'external-agents-list-external-agents',
        { name: 'external-agents-create-external-agent', needsApproval: true },
        'external-agents-get-external-agent-by-id',
        { name: 'external-agents-update-external-agent', needsApproval: true },
        { name: 'external-agents-delete-external-agent', needsApproval: true },
        // Function tools
        'function-tools-list-function-tools',
        { name: 'function-tools-create-function-tool', needsApproval: true },
        'function-tools-get-function-tool',
        { name: 'function-tools-update-function-tool', needsApproval: true },
        { name: 'function-tools-delete-function-tool', needsApproval: true },
        // Functions
        'functions-list-functions',
        { name: 'functions-create-function', needsApproval: true },
        'functions-get-function',
        { name: 'functions-update-function', needsApproval: true },
        { name: 'functions-delete-function', needsApproval: true },
        // Tools
        'tools-list-tools',
        { name: 'tools-create-tool', needsApproval: true },
        'tools-get-tool',
        { name: 'tools-update-tool', needsApproval: true },
        { name: 'tools-delete-tool', needsApproval: true },
        // API keys
        'API-keys-list-api-keys',
        { name: 'API-keys-create-api-key', needsApproval: true },
        'API-keys-get-api-key-by-id',
        { name: 'API-keys-update-api-key', needsApproval: true },
        { name: 'API-keys-delete-api-key', needsApproval: true },
        // MCP catalog
        'MCP-catalog-list-mcp-catalog',
        'third-party-MCP-servers-get-third-party-mcp-server',
        // OAuth
        { name: 'O-auth-initiate-oauth-login-public', needsApproval: true },
      ],
    }),
  ],
});
