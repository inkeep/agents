import { customerSupport } from "./agents/customer-support.js";
import { project } from "@inkeep/agents-sdk";
import { knowledgeBaseMcpTool } from "./tools/knowledge-base-mcp.js";
import { zendeskMcpTool } from "./tools/zendesk-mcp.js";

export const myProject = project({
  id: "customer-support",
  name: "Customer Support",
  description: "Customer support template",
  agents: () => [customerSupport],
  tools: () => [knowledgeBaseMcpTool, zendeskMcpTool],
});
