# Affected Routes Mapping

Map changed files to the UI routes they affect. Use this to determine which pages to screenshot.

## How to use

1. Look at the files changed in the PR diff
2. Find the matching file pattern(s) below
3. The corresponding route is the page to screenshot
4. Replace `{tenantId}`, `{projectId}`, etc. with real IDs from the target environment

## Component → Route Mapping

### Agent Visual Builder

| File pattern | Route | Description |
|---|---|---|
| `components/agent/nodes/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | Agent graph nodes (agent, MCP, sub-agent) |
| `components/agent/edges/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | Agent graph edges/connections |
| `components/agent/sidepane/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | Side panel editors (model, prompt, tools) |
| `components/agent/sidepane/nodes/model-*` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | Model selector, model section |
| `components/agent/sidepane/metadata/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | Agent metadata editor |
| `components/agent/toolbar/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | Agent toolbar (save, deploy, etc.) |
| `components/agent/playground/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | In-editor chat playground |
| `components/agent/copilot/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | Agent copilot panel |
| `features/agent/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}` | Agent domain logic, state, commands |

### Agent List

| File pattern | Route | Description |
|---|---|---|
| `components/agents/**` | `/{tenantId}/projects/{projectId}/agents` | Agent list page |

### Project Settings

| File pattern | Route | Description |
|---|---|---|
| `components/projects/form/**` | `/{tenantId}/projects/{projectId}/settings` | Project settings form |
| `components/projects/form/project-models-section.*` | `/{tenantId}/projects/{projectId}/settings` | Project model configuration |
| `features/project/**` | `/{tenantId}/projects/{projectId}/settings` | Project state |

### Projects List

| File pattern | Route | Description |
|---|---|---|
| `components/projects/**` (not `form/`) | `/{tenantId}/projects` | Projects list page |

### Credentials

| File pattern | Route | Description |
|---|---|---|
| `components/credentials/**` | `/{tenantId}/projects/{projectId}/credentials` | Credentials list |
| `components/credentials/views/**` | `/{tenantId}/projects/{projectId}/credentials/new/bearer` | New credential form |

### API Keys

| File pattern | Route | Description |
|---|---|---|
| `components/api-keys/**` | `/{tenantId}/projects/{projectId}/api-keys` | API keys page |

### MCP Servers

| File pattern | Route | Description |
|---|---|---|
| `components/mcp-servers/**` | `/{tenantId}/projects/{projectId}/mcp-servers` | MCP server list |
| `components/mcp-servers/form/**` | `/{tenantId}/projects/{projectId}/mcp-servers/{mcpServerId}/edit` | MCP server edit form |
| `components/mcp-servers/selection/**` | `/{tenantId}/projects/{projectId}/mcp-servers/new` | MCP server selection |

### External Agents

| File pattern | Route | Description |
|---|---|---|
| `components/external-agents/**` | `/{tenantId}/projects/{projectId}/external-agents` | External agent list |
| `components/external-agents/form/**` | `/{tenantId}/projects/{projectId}/external-agents/new` | External agent form |

### Triggers

| File pattern | Route | Description |
|---|---|---|
| `components/triggers/**` | `/{tenantId}/projects/{projectId}/agents/{agentId}/triggers` | Triggers list |
| `components/triggers/trigger-form*` | `/{tenantId}/projects/{projectId}/agents/{agentId}/triggers/new` | New/edit trigger form |

### Data Components

| File pattern | Route | Description |
|---|---|---|
| `components/data-components/**` | `/{tenantId}/projects/{projectId}/components` | Data component list |
| `components/data-components/form/**` | `/{tenantId}/projects/{projectId}/components/new` | Data component form |

### Artifact Components

| File pattern | Route | Description |
|---|---|---|
| `components/artifact-components/**` | `/{tenantId}/projects/{projectId}/artifacts` | Artifact list |
| `components/artifact-components/form/**` | `/{tenantId}/projects/{projectId}/artifacts/new` | Artifact form |

### Datasets & Evaluations

| File pattern | Route | Description |
|---|---|---|
| `components/datasets/**` | `/{tenantId}/projects/{projectId}/datasets` | Dataset list |
| `components/dataset-items/**` | `/{tenantId}/projects/{projectId}/datasets/{datasetId}` | Dataset item view |
| `components/evaluations/**` | `/{tenantId}/projects/{projectId}/evaluations` | Evaluations page |
| `components/evaluation-run-configs/**` | `/{tenantId}/projects/{projectId}/evaluations/run-configs/{configId}` | Run config results |
| `components/evaluation-jobs/**` | `/{tenantId}/projects/{projectId}/evaluations/jobs/{configId}` | Evaluation job results |

### Traces

| File pattern | Route | Description |
|---|---|---|
| `components/traces/**` | `/{tenantId}/projects/{projectId}/traces` | Traces overview |
| `hooks/use-traces*` | `/{tenantId}/projects/{projectId}/traces` | Traces data hooks |

### Organization Settings

| File pattern | Route | Description |
|---|---|---|
| `components/settings/**` | `/{tenantId}/settings` | Org settings |
| `components/access/**` | `/{tenantId}/projects/{projectId}/members` | Project members |

### Shared / Cross-cutting

| File pattern | Route | Description |
|---|---|---|
| `components/shared/model-configuration.*` | Multiple: agent editor + project settings | Model config (appears in both) |
| `components/form/**` | Multiple | Generic form components, affect all forms |
| `components/editors/**` | Multiple | JSON/prompt editors, affect agent + project pages |
| `components/ui/**` | Multiple | Base UI primitives, affects everything |
| `components/layout/**` | Multiple | Page headers, empty states |
| `components/errors/**` | Multiple | Error pages |
| `components/icons/**` | Multiple | Icons |

### Auth Pages

| File pattern | Route | Description |
|---|---|---|
| `app/login/**` | `/login` | Login page |
| `app/reset-password/**` | `/reset-password` | Password reset |
| `app/accept-invitation/**` | `/accept-invitation/{invitationId}` | Invitation acceptance |

### Documentation (agents-docs)

| File pattern | Route | Description |
|---|---|---|
| `agents-docs/content/**` | Preview docs site | Documentation pages |
| `agents-docs/_snippets/**` | Preview docs site | Reusable snippets |
| `agents-docs/public/images/**` | Preview docs site | Documentation images |

## Pages with Sensitive Data (extra caution)

These pages may display or accept sensitive information. Always verify masking works correctly:

| Route | Sensitive content |
|---|---|
| `/{tenantId}/projects/{projectId}/credentials/**` | API keys, OAuth secrets, private keys |
| `/{tenantId}/projects/{projectId}/api-keys` | API key prefixes, new key display |
| `/{tenantId}/projects/{projectId}/agents/{agentId}/triggers/*/edit` | Auth header values |
| `/{tenantId}/projects/{projectId}/mcp-servers/*/edit` | Server URLs with credentials |

## Vercel Preview URL Pattern

```
https://agents-git-{branch-name}-inkeep.vercel.app{route}
```

Replace `{branch-name}` with the PR branch (use hyphens, e.g., `bugfix/azure-model-selector` becomes `bugfix-azure-model-selector`).
