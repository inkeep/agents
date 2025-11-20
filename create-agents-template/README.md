## Overview

Projects are the top-level organizational unit in your Inkeep workspace. Each project contains its own agents, sub agents, tools, data components, and environment configurations.

## Workspace structure

After following the [Quick Start](/get-started/quick-start) guide, your workspace will be organized with the following directory structure:

```
workspace-root/                 
├── package.json                 # Workspace package.json
├── .env                         # Workspace environment variables
├── src/  
│   ├── inkeep.config.ts         # Workspace configuration file
│   ├── projects/
│   │   ├── my-agent-project/
│   │   │   ├── index.ts
│   │   │   ├── agents/
│   │   │   │   ├── main-agent.ts
│   │   │   │   └── support-agent.ts
│   │   │   ├── tools/
│   │   │   │   ├── search-tool.ts
│   │   │   │   └── calculator-tool.ts
│   │   │   ├── data-components/
│   │   │   │   ├── user-profile.ts
│   │   │   │   └── product-catalog.ts
│   │   │   ├── external-agents/
│   │   │   │   ├── exernal-agent-example.ts
│   │   │   └── environments/
│   │   │       ├── index.ts
│   │   │       ├── development.env.ts
│   │   │       └── production.env.ts
│   │   └── another-project/       # Additional projects can coexist
│   │       ├── index.ts
│   │       └── ...
```

</Tip>
The `src/inkeep.config.ts` file defines workspace configuration for all projects. See [Workspace Configuration](/typescript-sdk/workspace-configuration) for details.
</Tip>

## Architecture

This project follows a workspace structure with the following services:
- **Agents Manage UI** (Port 3000): Web interface
  - The agent framework visual builder. From the builder you can create, manage and visualize all your graphs.
- **Agents Manage API** (Port 3002): Agent configuration and management
  - Handles entity management and configuration endpoints.
- **Agents Run API** (Port 3003): Agent execution and chat processing  
  - Handles agent communication. You can interact with your agents either over MCP from an MCP client or through our React UI components library
- **MCP Service** (Port 3006): Custom MCP servers
  - Custom MCP servers for external tools and APIs. See [our guide](https://docs.inkeep.com/tutorials/mcp-servers/custom-mcp-servers#getting-started) for how to add MCP servers to your project.

## Project files and directories

### `index.ts`

The project entry point inside each project directory that exports your project definition:

```typescript file="my-agent-project/index.ts"
// Located inside project directory (e.g., my-agent-project/index.ts)
import { project } from '@inkeep/agents-sdk';
import { mainAgent } from './agents/main-agent';
import { supportAgent } from './agents/support-agent';
import { searchTool } from './tools/search-tool';
import { calculatorTool } from './tools/calculator-tool';
import { userProfile } from './data-components/user-profile';

export const myProject = project({
  id: 'my-agent-project',
  name: 'My Agent Project',
  description: 'A comprehensive multi-agent system',
  subAgents: () => [mainAgent, supportAgent],
  tools: () => [searchTool, calculatorTool],
  dataComponents: () => [userProfile],
});
```

### `agents/`

Contains agent definitions. Each file typically exports one agent:

```
// agents/customer-support.ts
import { agent, subAgent } from '@inkeep/agents-sdk';

const routerSubAgent = subAgent({
  id: 'support-router',
  name: 'Support Router',
  prompt: 'Route customer inquiries to appropriate specialists',
});

const billingSubAgent = subAgent({
  id: 'billing-specialist',
  name: 'Billing Specialist',
  prompt: 'Handle billing and payment inquiries',
});

export const customerSupportAgent = agent({
  defaultSubAgent: routerSubAgent,
  subAgents: () => [routerSubAgent, billingSubAgent],
});
```

See [Agents & Sub Agents](https://docs.inkeep.com/typescript-sdk/agent-settings) for more information about creating and configuring agents and sub agents.

### `tools/`

Tool definitions that can be used by Sub Agents:

```
// tools/database-query.ts
import { mcpTool } from '@inkeep/agents-sdk';

export const databaseQueryTool = mcpTool({
  id: 'db-query',
  name: 'Database Query Tool',
  description: 'Execute SQL queries against the database',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      database: { type: 'string' }
    }
  },
  // Tool implementation...
});
```

See [MCP Tools](https://docs.inkeep.com/typescript-sdk/tools/mcp-tools) and [Function Tools](https://docs.inkeep.com/typescript-sdk/tools/function-tools) for more information about creating and configuring MCP tools and function tools.

### `data-components/`

Data components for structured UI output:

```
// data-components/customer-data.ts
import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const customerData = dataComponent({
  id: 'customer-data',
  name: 'Customer Information',
  description: 'Customer profile and interaction history',
  props: z.object({
    customerId: z.string().describe("Customer ID"),
    name: z.string().describe("Customer name"),
    email: z.string().describe("Customer email"),
  }),
});
```

See [Data Components](https://docs.inkeep.com/typescript-sdk/structured-outputs/data-components) for more information about creating and configuring data components.

### `external-agents/`

External agent definitions:

```
import { externalAgent } from '@inkeep/agents-sdk';

export const exernalAgentExample = externalAgent({
  id: 'exernal-agent-example',
  name: 'Exernal Agent Example',
  description: 'An example external agent',
  baseUrl: 'https://api.example.com/agents/support',
  credentialReference: myCredentialReference,
});
```

See [External Agents](https://docs.inkeep.com/typescript-sdk/external-agents) for more information about creating and configuring external agents.

### `environments/`

Environment-specific configurations for different deployment stages:

```
// environments/production.env.ts
import { registerEnvironmentSettings } from '@inkeep/agents-sdk';
import { CredentialStoreType } from '@inkeep/agents-core';

export const production = registerEnvironmentSettings({
  credentials: {
    "openai-prod": {
      id: "openai-prod",
      type: CredentialStoreType.memory,
      credentialStoreId: "memory-default",
      retrievalParams: {
        key: "OPENAI_API_KEY_PROD",
      },
    },
  },
});
```

## How to add a new project

Use the `inkeep add` command to add template projects from the [Inkeep Agents Cookbook](https://github.com/inkeep/agents/tree/main/agents-cookbook/template-projects) to your workspace.

### Prerequisite

Ensure you have the [Inkeep CLI](/typescript-sdk/cli-reference) installed.

```
npm install -g @inkeep/agents-cli
```

### Step 1: Navigate to your projects directory

Navigate to the `src/projects` directory:

```
cd src/projects
```

### Step 2: List available templates

To see all available project templates, run `inkeep add` without any arguments:

```
inkeep add
```

This displays a list of available project templates you can add to your workspace.

### Step 3: Add a project template

Add a specific project template using the `--project` flag:

```
inkeep add --project docs-assistant
```

For new projects, we recommend starting with a simple project template like docs-assistant, which you can customize to your needs.

## Pushing changes to the Visual Builder

After making changes to your project code, use `inkeep push` to sync your local TypeScript project to the Visual Builder. This allows you to continue development using the Visual Builder's drag-and-drop interface.

### Prerequisite

Ensure you have the [Inkeep CLI](/typescript-sdk/cli-reference) installed.

```
npm install -g @inkeep/agents-cli
```

### Step 1: Navigate to your project directory

Change to the directory containing your project's `index.ts` file:

```
cd src/projects/my-agent-project
```

### Step 2: Push your project

Run the push command:

```
inkeep push
```

### Step 3: Verify in Visual Builder

After pushing, refresh your Visual Builder. Your project and all its agents, Sub Agents, tools, and data components will be available in the Visual Builder.

### Additional options

**Validate without pushing:**

To validate your project without actually pushing changes, use the `--json` flag:

```
inkeep push --json
```

## Pulling changes from the Visual Builder

When you make changes in the Visual Builder (such as updating prompts or modifying agent configurations), use `inkeep pull` to sync those changes back to your local TypeScript project.

### Prerequisite

The `inkeep pull` command in-part leverages AI to sync your TypeScript files to the state of your Visual Builder, so **at least one** of the below environment variables to be defined:

```
# Choose one:
ANTHROPIC_API_KEY=your_api_key_here
# or
OPENAI_API_KEY=your_api_key_here
# or
GOOGLE_API_KEY=your_api_key_here
```

The CLI prioritizes Anthropic → OpenAI → Google.

Here are the models used:

| Provider  | Model(s)                              | Where to Get API Key                                |
| --------- | ------------------------------------- | --------------------------------------------------- |
| Anthropic | Claude Sonnet 4.5 (extended thinking) | [Anthropic Console](https://console.anthropic.com/) |
| OpenAI    | GPT-5.1                               | [OpenAI Platform](https://platform.openai.com/)     |
| Google    | Gemini 2.5 Flash                      | [Google AI Studio](https://ai.google.dev/)          |

### Step 1: Navigate to your project directory

Change to the directory containing your project's `index.ts` file:

```
cd src/projects/my-agent-project
```

### Step 2: Pull changes from Visual Builder

Run the pull command:

```
inkeep pull
```

### Step 3: Verify the changes

Check your project files to see the updates. For example, if you changed an agent's prompt in the Visual Builder:

```
cat agents/my-agent.ts
```

The file should reflect the updated prompt from the Visual Builder.

See [CLI Reference](/typescript-sdk/cli-reference#inkeep-pull) for more information about the `inkeep pull` command.

## How to add a new MCP server

Use the `inkeep add` command to add custom MCP server templates from the [Inkeep Agents Cookbook](https://github.com/inkeep/agents/tree/main/agents-cookbook/template-mcps) to your workspace. These templates provide starter code for common MCP server integrations that you can customize and deploy.

### Prerequisite

Ensure you have the [Inkeep CLI](/typescript-sdk/cli-reference) installed.

```
npm install -g @inkeep/agents-cli
```

### Step 1: Navigate to your workspace root

Navigate to your workspace root directory (where your `package.json` is located):

```
cd /path/to/your/workspace
```

The CLI will automatically detect the `apps/mcp/app` directory in your workspace.

### Step 2: List available MCP templates

To see all available MCP server templates, run `inkeep add` without any arguments:

```
inkeep add
```

This displays both project templates and MCP server templates you can add to your workspace.

### Step 3: Add an MCP server template

Add a specific MCP server template using the `--mcp` flag:

```
inkeep add --mcp zendesk
```

The template will be added to `apps/mcp/app/[template-name]/mcp/route.ts` automatically.

### Step 4: Customize and register

The MCP server will be exposed at `http://localhost:3000/[template-name]/mcp`. Customize it with your API credentials and business logic, then register it as a tool using `mcpTool`:

```
import { mcpTool } from '@inkeep/agents-sdk';

export const zendeskTool = mcpTool({
  id: 'zendesk',
  name: 'zendesk',
  description: 'Zendesk API',
  serverUrl: 'http://localhost:3000/zendesk/mcp',
});
```

See [MCP Tools](/typescript-sdk/tools/mcp-tools) for more information about registering MCP servers as tools.

## Deployment Guides

To build and run your own images you can follow the [Build a Custom Image](https://docs.inkeep.com/self-hosting/docker-build) docs.

This repostory contains a `docker-compose.yml` and template `Dockerfile` for each service:
- `Dockerfile.manage-ui`
- `Dockerfile.manage-api`
- `Dockerfile.run-ui`
- `Dockerfile.migrate`

To build and run:

```
docker compose build
docker compose up -d
```

### Deploy using official prebuilt images
- [Deploy to Vercel](https://docs.inkeep.com/self-hosting/vercel)
- [Docker (Local Dev)](https://docs.inkeep.com/self-hosting/docker-local)
- [GCP Compute Engine](https://docs.inkeep.com/self-hosting/gcp-compute-engine)
- [GCP Cloud Run](https://docs.inkeep.com/self-hosting/gcp-cloud-run)
- [AWS EC2](https://docs.inkeep.com/self-hosting/aws-ec2)
- [Hetzner](https://docs.inkeep.com/self-hosting/hetzner)

