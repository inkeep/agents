# Inkeep Agents

Build AI Agents with a **No-Code Visual Builder** or **TypeScript SDK**. Agents can be edited in either with **full 2-way sync**, so technical and non-technical teams can create and manage Agents in a single platform. 

Get started with the [docs](https://docs.inkeep.com) or [1-minute quick start](https://docs.inkeep.com/get-started/quick-start).

## Two ways to build

### No-Code Visual Builder

A no-code canvas so any team can create and own the Agents they care about. 

<img
  src="agents-docs/public/gifs/drag-n-drop.gif"
  alt="Visual Builder Demo"
  width="100%"
  style="border-radius: 10px"
/>

### TypeScript Agents SDK

A code-first framework so engineering teams can build with the tools they expect.

```typescript
import { agent, subAgent } from "@inkeep/agents-sdk";
import { consoleMcp } from "./mcp";

const helloAgent = subAgent({
  id: "hello-agent",
  name: "Hello Agent",
  description: "Says hello",
  canUse: () => [consoleMcp], 
  prompt: 'Reply to the user and console log "hello world" in fun variations like h3llo world.',
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

For a full overview, see the [Concepts](https://docs.inkeep.com/concepts) guide. For managed cloud hosting, [sign up](https://inkeep.com/cloud-waitlist) to get notified when available.

## Architecture

The Inkeep Agent Platform is composed of several key services and libraries that work together:

- **agents-manage-api**: An API that handles configuration of Agents, Sub Agents, MCP Servers, Credentials, and Projects with a REST API.
- **agents-manage-ui**: Visual Builder web interface for creating and managing Agents. Writes to the `agents-manage-api`.
- **agents-sdk**: TypeScript SDK (`@inkeep/agents-sdk`) for declaratively defining Agents and custom tools in code. Writes to `agents-manage-api`.
- **agents-cli**: Includes various handy utilities, including `inkeep push` and `inkeep pull` which sync your TypeScript SDK code with the Visual Builder.
- **agents-run-api**: The Runtime API that exposes Agents as APIs and executes Agent conversations. Keeps conversation state and emits OTEL traces.
- **agents-ui**: A UI component library of chat interfaces for embedding rich, dynamic Agent conversational experiences in web apps.

Under the hood, the framework uses the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) for interfacing with LLM providers. The `agents-sdk`/ `agents-manage-api` share many concepts with the AI SDK, and `agents-run-api` outputs a data stream compatible with Vercel's [`useChat`](https://ai-sdk.dev/docs/ai-sdk-ui) and [AI Elements](https://ai-sdk.dev/elements/overview) primitives for custom UIs.

## License and Community

The Inkeep Agent Framework is licensed under the **Elastic License 2.0** ([ELv2](https://www.elastic.co/licensing/elastic-license)) subject to **Inkeep's Supplemental Terms** ([SUPPLEMENTAL_TERMS.md](https://github.com/inkeep/agents/blob/main/SUPPLEMENTAL_TERMS.md)). This is a [fair-code](https://faircode.io/), source-available license that allows broad usage while protecting against certain competitive uses.

Inkeep is designed to be extensible and open: use the LLM provider of your choice, use Agents via standard protocols, and easily deploy and self-host Agents in your own infra. 

If you'd like to contribute, follow our [contribution guide](https://docs.inkeep.com/community/contributing/overview).

[Join our community](https://docs.inkeep.com/community/inkeep-community) to get support, stay up to date, and share feedback.
