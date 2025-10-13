# Inkeep Agents

Inkeep is a platform to create and manage AI Agents with a **No-Code Visual Builder** or **TypeScript SDK**. With **full 2-way sync**, technical and non-technical teams can create Agents in one platform. 

You can deploy Inkeep Agents as **real-time chat assistants** for your customers or internal teams, or for agent-driven **workflow automation** that can handle complex business processes.

To get started, see the [docs](https://docs.inkeep.com).

## Two ways to build your agents

1. **Visual Builder**: A no-code interface for creating and managing agents and agent workflows. Great for both technical and non-technical teams.

<img
  src="agents-docs/public/gifs/visual-builder.gif"
  alt="Visual Builder Demo"
  width="100%"
  style="border-radius: 10px"
/>

1. **TypeScript SDK**: A code-first approach for building and managing agents, allowing you to build complex agent systems with everything you expect as a developer.

```typescript
import { subAgent, agent } from "@inkeep/agents-sdk";

const helloAgent = subAgent({
  id: "hello-agent",
  name: "Hello Agent",
  description: "Says hello",
  prompt: 'You are a basic Agent that just says hello. You only reply with the word "hello", but you may do it in different variations like h3110, h3110w0rld, h3110w0rld! etc...',
});

export const basicAgent = agent({
  id: "basic-agent",
  name: "Basic Agent Example",
  description: "A basic agent",
  defaultSubAgent: helloAgent,
  subAgents: () => [helloAgent],
});
```

## Platform

The Inkeep Agent platform includes:
- A Visual Builder & TypeScript SDK with 2-way sync
- Multi-Agent architecture for building teams of agents
- MCP Tools with Credential Management
- A UI Component Library for dynamic AI chat experiences
- Triggering Agents with MCP, A2A, & Vercel SDK APIs
- Observability via a Traces UI & OpenTelemetry
- Easy deployment to Vercel and Docker

For a full overview, see the [Concepts](https://docs.inkeep.com/concepts) guide.

## Architecture

The Inkeep Agent Platform is composed of several key services and libraries that work together:

- **agents-manage-api**: An API that handles configuration of Agents, Sub Agents, MCP Servers, Credentials, and Projects with a REST API.
- **agents-manage-ui**: Visual Builder web interface for creating and managing Agents. Writes to the `agents-manage-api`.
- **agents-sdk**: TypeScript SDK (`@inkeep/agents-sdk`) for declaratively defining Agents and custom tools in code. Writes to `agents-manage-api`.
- **agents-cli**: Includes various handy utilities, including `inkeep push` and `inkeep pull` which sync your TypeScript SDK code with the Visual Builder.
- **agents-run-api**: The Runtime API that exposes Agents as APIs and executes Agent conversations. Keeps conversation state and emits OTEL traces.
- **agents-ui**: A UI component library of chat interfaces for embedding rich, dynamic Agent conversational experiences in web apps.

Underneath the hood, the framework uses the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) for interfacing with LLM providers. The `agents-sdk`/ `agents-manage-api` share many concepts with Vercel's `ai` SDK, and `agents-run-api` outputs an chat stream compatible with Vercel's [`useChat`](https://ai-sdk.dev/docs/ai-sdk-ui) and [AI Elements](https://ai-sdk.dev/elements/overview) primitives for custom UIs.

## License and Community

The Inkeep Agent Framework is licensed under the **Elastic License 2.0** ([ELv2](https://www.elastic.co/licensing/elastic-license)) subject to **Inkeep's Supplemental Terms** ([SUPPLEMENTAL_TERMS.md](https://github.com/inkeep/agents/blob/main/SUPPLEMENTAL_TERMS.md)). This is a [fair-code](https://faircode.io/), source-available license that allows broad usage while protecting against certain competitive uses.

We designed Inkeep to be extensible and open: you can use the LLM provider of your choice, use Agents via open protocols, and easily deploy and self-host Agents in your own infra. 

If you'd like to contribute, follow our [contribution guide](https://docs.inkeep.com/community/contributing/overview).

[Follow us](https://docs.inkeep.com/community/inkeep-community) to stay up to date, get help, and share feedback.