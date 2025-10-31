import { agent, subAgent } from "@inkeep/agents-sdk";
import { inkeepRagMcpTool } from "../tools/inkeep-rag-mcp";

/**
 * Docs Assistant Agent
 *
 * This agent is responsible for answering questions about Inkeep documentation.
 */

const docsAssistant = subAgent({
  id: "docs-assistant",
  name: "Docs Assistant",
  description: "A agent that can answer questions about Inkeep documentation",
  prompt: `You are a helpful assistant that answers questions about the documentation.
    Use the Inkeep RAG MCP tool to find relevant information.`,
  canUse: () => [inkeepRagMcpTool],
});

export const docsAssistantAgent = agent({
  id: "docs-assistant",
  name: "Docs Assistant",
  description: "A agent that can answer questions about the documentation",
  defaultSubAgent: docsAssistant,
  subAgents: () => [docsAssistant],
});
