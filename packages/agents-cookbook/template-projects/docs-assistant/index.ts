import { docsAssistantAgent } from "./agents/docs-assistant";
import { project } from "@inkeep/agents-sdk";
import { inkeepRagMcpTool } from "./tools/inkeep-rag-mcp";

export const myProject = project({
  id: "docs-assistant",
  name: "Docs Assistant",
  description: "Docs assistant template",
  agents: () => [docsAssistantAgent],
  tools: () => [inkeepRagMcpTool],
});
