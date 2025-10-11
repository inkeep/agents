# Inkeep Agents

Inkeep is a platform to create and manage AI Agents with a **No-Code Visual Builder** or **TypeScript SDK**. With **full 2-way sync**, technical and non-technical teams can create Agents in one platform. 

You can deploy Inkeep Agents as **real-time chat assistants** for your customers or internal teams, or as **agentic workflows** for doing repetitive, time-consuming tasks.

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

   ```javascript
    import { agent, agentGraph } from '@inkeep/agents-sdk';

    const helloAgent = agent({
      id: 'hello-agent',
      name: 'Hello Agent',
      description: 'A basic agent',
      prompt:
        'You are a basic agent that just says hello. You only reply with the word "hello", but you may do it in different variations like h3110, h3110w0rld, h3110w0rld! etc...',
    });

    export const graph = agentGraph({
      id: 'basic-graph',
      name: 'Basic Graph Example',
      description: 'A basic graph',
      defaultSubAgent: helloAgent,
      subAgents: () => [helloAgent],
    });
   ```

## Inkeep Open Source

Inkeep **Open Source** includes:
- A Visual Builder & TypeScript SDK with 2-way sync
- Multi-Agent Architecture to support Teams of Agents
- MCP Tools with Credential Management
- A UI Component Library for dynamic AI chat experiences
- Triggering Agents with MCP, A2A, & Vercel SDK APIs
- Observability via Traces UI & OpenTelemetry

For a full overview, see the [Concepts](https://docs.inkeep.com/concepts) guide.

## Contributing to the Inkeep Agent Framework

Thank you for your interest! [Here are the guidelines on how to contribute to the Inkeep Agent Framework](https://docs.inkeep.com/community/contributing/overview).

## License

The Inkeep Agent Framework is licensed under the **Elastic License 2.0** ([ELv2](https://www.elastic.co/licensing/elastic-license)) subject to **Inkeep's Supplemental Terms** ([SUPPLEMENTAL_TERMS.md](https://github.com/inkeep/agents/blob/main/SUPPLEMENTAL_TERMS.md)). This is a source-available license that allows broad usage while protecting against certain competitive uses.
