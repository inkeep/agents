# Inkeep Agents

Build AI Agents with a **No-Code Visual Builder** or **TypeScript SDK**. Agents can be edited in either with **full 2-way sync**, so technical and non-technical teams can create and manage Agents in one platform. 

Get started with the [docs](https://docs.inkeep.com) or [1-minute quick start](https://docs.inkeep.com/get-started/quick-start).

## Two ways to build

### No-Code Visual Builder

A drag-and-drop canvas so any team can create and own the Agents they care about.

<img
  src="agents-docs/public/gifs/drag-n-drop.gif"
  alt="Visual Builder Demo"
  width="100%"
  style="border-radius: 10px"
/>

### TypeScript Agents SDK

A code-first framework so engineering teams can build with typesafety, intellisense, CI/CD, and the tools they expect.

```typescript
import { agent, subAgent } from "@inkeep/agents-sdk";
import { consoleMcp } from "./mcp";

const helloAgent = subAgent({
  id: "hello-agent",
  name: "Hello Agent",
  description: "Says hello",
  canUse: () => [consoleMcp], 
  prompt: `Reply to the user and console log "hello world" with fun variations like h3llo world`,
});

export const basicAgent = agent({
  id: "basic-agent",
  name: "Basic Agent",
  description: "A basic agent",
  defaultSubAgent: helloAgent,
  subAgents: () => [helloAgent],
});
```

The **Visual Builder and TypeScript SDK are fully interoperable**: technical and non-technical teams can edit and manage Agents in either format and collaborate with others at any time.

## Use Cases

Inkeep Agents can operate as real-time **AI Chat Assistants**, for example:
- a customer experience agent for help centers, technical docs, or in-app experiences
- an internal copilot to assist your support, sales, marketing, ops, and other teams

Agents can also be used for **AI Workflow Automation** like:
- Creating and updating knowledge bases, documentation, and blogs
- Updating CRMs, triaging helpdesk tickets, and tackling repetitive tasks

## Platform Overview

**Inkeep Open Source** includes:
- A Visual Builder & TypeScript SDK with 2-way sync
- Multi-agent architecture to support teams of agents
- MCP Tools with credential management
- A UI component library for dynamic chat experiences
- Triggering Agents via MCP, A2A, & Vercel SDK APIs
- Observability via a Traces UI & OpenTelemetry
- Easy deployment using Vercel or Docker

For a full overview, see the [Concepts](https://docs.inkeep.com/concepts) guide.

Interested in a managed platform? Sign up for the [Inkeep Cloud waitlist](https://inkeep.com/cloud-waitlist) or learn about [Inkeep Enterprise](https://inkeep.com/enterprise).

## Architecture

The Inkeep Agent Platform is composed of several key services and libraries that work together:

- **agents-api**: An API that handles configuration of Agents, Sub Agents, MCP Servers, Credentials, and Projects with a REST API. Additionally, it exposes Agent execution and evaluation. The API tracks conversation state and emits OTEL traces.
- **agents-manage-ui**: Visual Builder web interface for creating and managing Agents. Writes to the `agents-api`.
- **agents-sdk**: TypeScript SDK (`@inkeep/agents-sdk`) for declaratively defining Agents and custom tools in code. Writes to `agents-api`.
- **agents-cli**: Includes various handy utilities, including `inkeep push` and `inkeep pull` which sync your TypeScript SDK code with the Visual Builder.
- **agents-ui**: A UI component library of chat interfaces for embedding rich, dynamic conversational AI experiences in web apps.

Under the hood, the framework uses the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) for interfacing with LLM providers, so it's compatible with Vercel's [`useChat`](https://ai-sdk.dev/docs/ai-sdk-ui) hook and other AI primatives.

## License and Community

The Inkeep Agent Framework is licensed under the **Elastic License 2.0** ([ELv2](https://www.elastic.co/licensing/elastic-license)) subject to **Inkeep's Supplemental Terms** ([SUPPLEMENTAL_TERMS.md](https://github.com/inkeep/agents/blob/main/SUPPLEMENTAL_TERMS.md)). This is a [fair-code](https://faircode.io/), source-available license that allows broad usage while protecting against certain competitive uses.

Inkeep is designed to be extensible and open: use the LLM provider of your choice, use Agents via standard protocols, and easily deploy and self-host Agents in your own infra. 

If you'd like to contribute, follow our [contribution guide](https://docs.inkeep.com/community/contributing/overview).

[Join our community](https://docs.inkeep.com/community/inkeep-community) to get support, stay up to date, and share feedback.

## FAQ

### What is Inkeep Agents?

Inkeep Agents is an open-source platform for building AI agents with either a **No-Code Visual Builder** (drag-and-drop) or a **TypeScript SDK** (code-first). Both approaches stay fully in sync, so technical and non-technical team members can collaborate on the same agents.

### How do I get started?

The fastest way is the [1-minute quick start](https://docs.inkeep.com/get-started/quick-start). You can also explore the [full documentation](https://docs.inkeep.com) for concepts, architecture, and deployment guides.

### What's the difference between Visual Builder and TypeScript SDK?

- **Visual Builder**: A drag-and-drop canvas for creating agents without writing code. Ideal for product managers, support teams, and non-technical users.
- **TypeScript SDK**: A code-first framework (`@inkeep/agents-sdk`) for engineering teams who want typesafety, intellisense, CI/CD integration, and version control.

Both are fully interoperable — changes made in one are reflected in the other.

### How do agents access external tools and data?

Agents use **MCP (Model Context Protocol) Tools** with built-in credential management. You can connect to APIs, databases, CRMs, knowledge bases, and more. Credentials are stored securely and shared across agents as needed.

### Which LLM providers are supported?

Inkeep Agents uses the [Vercel AI SDK](https://ai-sdk.dev) under the hood, which supports 50+ LLM providers including OpenAI, Anthropic, Google, Cohere, and local models via Ollama. You can configure your preferred provider in the agent settings.

### How do I deploy an agent?

You can deploy agents via:
- **Vercel**: One-click deployment with the Vercel AI SDK integration
- **Docker**: Self-host using the provided Docker Compose configuration
- **Custom infrastructure**: The platform is designed to be extensible and self-hostable

### What is the multi-agent architecture?

Inkeep supports **sub-agents** — agents that can delegate tasks to other specialized agents. This enables complex workflows where a primary agent coordinates with multiple sub-agents, each handling a specific domain (e.g., customer support, data analysis, content creation).

### How do I contribute?

Follow the [contribution guide](https://docs.inkeep.com/community/contributing/overview). The project uses standard GitHub workflows — fork, create a branch, and submit a PR. Join the [community](https://docs.inkeep.com/community/inkeep-community) for support and discussions.

### What license is this under?

The Inkeep Agent Framework is licensed under the **Elastic License 2.0 (ELv2)** with Inkeep's Supplemental Terms. This is a fair-code, source-available license that allows broad usage while protecting against certain competitive uses. See [SUPPLEMENTAL_TERMS.md](SUPPLEMENTAL_TERMS.md) for details.
