# Inkeep Agents

With Inkeep, you can build and ship AI Agents with a **No-Code Visual Builder** or **TypeScript SDK**. Agents can be edited in code or no-code with **full 2-way sync**, so technical and non-technical teams can create and manage their Agents in a single platform.

## Use Cases

Inkeep Agents can operate as real-time **AI Chat Assistants**, for example:
- a customer experience agent for customer support, technical docs, or in-app product copilot
- an internal copilot to assist your support, sales, marketing, ops, and other teams

Agents can also be used for **AI workflow automation** like:
- Creating and updating knowledge bases, documentation, and blogs
- Updating CRMs, triaging helpdesk tickets, and streamlining repetitive tasks

To get started, see the [docs](https://docs.inkeep.com).

## Two ways to build

### No-Code Visual Builder

A no-code drag-and-drop canvas designed to allow any team to create and manage teams of Agents visually.

<img
  src="https://docs.inkeep.com/gifs/visual-builder.gif"
  alt="No-Code Agent Builder demo"
  width="100%"
  style={{ borderRadius: "10px" }}
/>

### TypeScript Agents SDK

A code-first approach for building and managing multi-agent systems. Engineering teams to build with the tools and developer experience they expect.

   ```typescript
   import { agent, subAgent } from "@inkeep/agents-sdk";

   const helloAgent = subAgent({
     id: "hello-agent",
     name: "Hello Agent",
     description: "Says hello",
     prompt: 'Only reply with the word "hello", but you may do it in different variations like h3110, h3110w0rld, h3110w0rld! etc...',
   });

   export const basicAgent = agent({
     id: "basic-agent",
     name: "Basic Agent",
     description: "A basic agent",
     defaultSubAgent: helloAgent,
     subAgents: () => [helloAgent],
   });
   ```

The **Visual Builder and TypeScript SDK are fully interoperable**: your technical and non-technical teams can edit and manage Agents in either format and switch or collaborate with others at any time.

## Platform Overview

**Inkeep Open Source** includes:
- A Visual Builder & TypeScript SDK with 2-way sync
- Multi-agent architecture to support teams of agents
- MCP Tools with credentials management
- A UI component library for dynamic chat experiences
- Triggering Agents via MCP, A2A, & Vercel SDK APIs
- Observability via a Traces UI & OpenTelemetry
- Easy deployment to Vercel and using Docker

For a full overview, see the [Concepts](https://docs.inkeep.com/concepts) guide.

## Architecture

The Inkeep Agent Platform is composed of several key services and libraries that work together:

- **agents-manage-api**: An API that handles configuration of Agents, Sub Agents, MCP Servers, Credentials, and Projects with a REST API.
- **agents-manage-ui**: Visual Builder web interface for creating and managing Agents. Writes to the `agents-manage-api`.
- **agents-sdk**: TypeScript SDK (`@inkeep/agents-sdk`) for declaratively defining Agents and custom tools in code. Writes to `agents-manage-api`.
- **agents-cli**: Includes various handy utilities, including `inkeep push` and `inkeep pull` which sync your TypeScript SDK code with the Visual Builder.
- **agents-run-api**: The Runtime API that exposes Agents as APIs and executes Agent conversations. Keeps conversation state and emits OTEL traces.
- **agents-ui**: A UI component library of chat interfaces for embedding rich, dynamic Agent conversational experiences in web apps.

Underneath the hood, the framework uses the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) for interfacing with LLM providers. The `agents-sdk`/ `agents-manage-api` share many concepts with Vercel's `ai` SDK, and `agents-run-api` outputs a data stream compatible with Vercel's [`useChat`](https://ai-sdk.dev/docs/ai-sdk-ui) and [AI Elements](https://ai-sdk.dev/elements/overview) primitives for custom UIs.

## License and Community

The Inkeep Agent Framework is licensed under the **Elastic License 2.0** ([ELv2](https://www.elastic.co/licensing/elastic-license)) subject to **Inkeep's Supplemental Terms** ([SUPPLEMENTAL_TERMS.md](https://github.com/inkeep/agents/blob/main/SUPPLEMENTAL_TERMS.md)). This is a [fair-code](https://faircode.io/), source-available license that allows broad usage while protecting against certain competitive uses.

Inkeep is designed to be extensible and open: you can use the LLM provider of your choice, use Agents via open protocols, and easily deploy and self-host Agents in your own infra. 

If you'd like to contribute, follow our [contribution guide](https://docs.inkeep.com/community/contributing/overview).

[Follow us](https://docs.inkeep.com/community/inkeep-community) to stay up to date, get help, and share feedback.
