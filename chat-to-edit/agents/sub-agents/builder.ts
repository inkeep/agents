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

Use the transfer command to hand off to the MCP Manager agent who specializes in MCP connections.

## Feedback Improvement Workflow

If you were delegated to by the Feedback Analyst as part of a feedback improvement workflow:
1. Apply the recommended config changes (prompt updates, tool adjustments, etc.)
2. Once all changes are applied, respond with a summary of what you changed
3. Do NOT ask the user what to do next — just summarize and finish so control returns to the Feedback Analyst`,
  canTransferTo: () => [mcpManager],
  canUse: () => [
    inkeepManagementTools.with({
      headers: {
        'x-forwarded-cookie': `${headersBuilder.toTemplate('x-forwarded-cookie')}`,
      },
      selectedTools: [
        // Projects
        'projects-list-projects',
        { name: 'projects-create-project' },
        'projects-get-project-by-id',
        { name: 'projects-update-project' },
        { name: 'projects-delete-project' },
        // Sub-agents
        'sub-agents-list-subagents',
        { name: 'sub-agents-create-subagent' },
        'sub-agents-get-subagent-by-id',
        { name: 'sub-agents-update-subagent' },
        { name: 'sub-agents-delete-subagent' },
        // Sub-agent relations
        'sub-agents-list-sub-agent-relations',
        { name: 'sub-agents-create-sub-agent-relation' },
        'sub-agents-get-sub-agent-relation-by-id',
        { name: 'sub-agents-update-sub-agent-relation' },
        { name: 'sub-agents-delete-sub-agent-relation' },
        // Sub-agent external agent relations
        'sub-agents-list-sub-agent-external-agent-relations',
        {
          name: 'sub-agents-create-sub-agent-external-agent-relation',
          needsApproval: true,
        },
        'sub-agents-get-sub-agent-external-agent-relation-8f1',
        {
          name: 'sub-agents-update-sub-agent-external-agent-relation',
          needsApproval: true,
        },
        {
          name: 'sub-agents-delete-sub-agent-external-agent-relation',
          needsApproval: true,
        },
        // Sub-agent team agent relations
        'sub-agents-list-sub-agent-team-agent-relations',
        {
          name: 'sub-agents-create-sub-agent-team-agent-relation',
          needsApproval: true,
        },
        'sub-agents-get-sub-agent-team-agent-relation-by-id',
        {
          name: 'sub-agents-update-sub-agent-team-agent-relation',
          needsApproval: true,
        },
        {
          name: 'sub-agents-delete-sub-agent-team-agent-relation',
          needsApproval: true,
        },
        // Agents
        'agents-list-agents',
        { name: 'agents-create-agent' },
        'agents-get-agent',
        { name: 'agents-update-agent' },
        { name: 'agents-delete-agent' },
        'agents-get-related-agent-infos',
        // Subagent tool relations
        'sub-agents-list-subagent-tool-relations',
        { name: 'sub-agents-create-subagent-tool-relation' },
        'sub-agents-get-subagent-tool-relation',
        { name: 'sub-agents-update-subagent-tool-relation' },
        { name: 'sub-agents-delete-subagent-tool-relation' },
        'sub-agents-get-subagents-for-tool',
        // Artifact component relations
        'agents-get-artifact-components-for-agent',
        'agents-get-agents-using-artifact-component',
        {
          name: 'agents-associate-artifact-component-with-agent',
          needsApproval: true,
        },
        {
          name: 'agents-remove-artifact-component-from-agent',
          needsApproval: true,
        },
        'agents-check-artifact-component-agent-association',
        // Data component relations
        'agents-get-data-components-for-agent',
        'agents-get-agents-using-data-component',
        {
          name: 'agents-associate-data-component-with-agent',
          needsApproval: true,
        },
        {
          name: 'agents-remove-data-component-from-agent',
          needsApproval: true,
        },
        'agents-check-data-component-agent-association',
        // Artifact components
        'artifact-components-list-artifact-components',
        { name: 'artifact-components-create-artifact-component' },
        'artifact-components-get-artifact-component-by-id',
        { name: 'artifact-components-update-artifact-component' },
        { name: 'artifact-components-delete-artifact-component' },
        // Context configs
        'context-configs-list-context-configs',
        { name: 'context-configs-create-context-config' },
        'context-configs-get-context-config-by-id',
        { name: 'context-configs-update-context-config' },
        { name: 'context-configs-delete-context-config' },
        // Credentials
        'credentials-list-credentials',
        { name: 'credentials-create-credential', needsApproval: true },
        'credentials-get-credential-by-id',
        { name: 'credentials-update-credential', needsApproval: true },
        { name: 'credentials-delete-credential', needsApproval: true },
        // Credential stores
        'credential-stores-list-credential-stores',
        { name: 'credential-stores-create-credential-in-store', needsApproval: true },
        // Data components
        'data-components-list-data-components',
        { name: 'data-components-create-data-component', needsApproval: true },
        'data-components-get-data-component-by-id',
        { name: 'data-components-update-data-component', needsApproval: true },
        { name: 'data-components-delete-data-component', needsApproval: true },
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
      ],
    }),
  ],
});
