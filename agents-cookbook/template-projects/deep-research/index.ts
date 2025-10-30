import { deepResearchAgent } from "./agents/deep-research.js";
import { project } from "@inkeep/agents-sdk";
import { firecrawlMcpTool } from "./tools/firecrawl-mcp.js";

export const myProject = project({
  id: "deep-research",
  name: "Deep Research",
  description: "Deep research project template",
  agents: () => [deepResearchAgent],
  tools: () => [firecrawlMcpTool],
});
