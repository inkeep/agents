import { agent, subAgent } from "@inkeep/agents-sdk";
import { slackMcpTool } from "../tools/slack-mcp";

/**
 * Note: Connect to the Notion MCP through the Visual Builder using 1-click OAuth
 */

const slackDigest = subAgent({
  id: "slack-digest",
  name: "Slack Digest",
  description:
    "Takes a Notion page, summarizes it, and sends the summary via Slack!",
  prompt:
    "You are a helpful assistant that processes Notion pages and shares summaries via Slack. You should: 1) Extract and understand the key information from a Notion page, 2) Create a concise, well-structured summary that captures the main points and important details, 3) Send the summary to the specified Slack channel using the Slack tool. Make sure the summary is clear, actionable, and formatted appropriately for Slack.",
  canUse: () => [slackMcpTool],
});

// Agent
export const slackDigestAgent = agent({
  id: "slack-digest",
  name: "Slack Digest",
  description:
    "Takes a Notion page, summarizes it, and sends the summary via Slack",
  defaultSubAgent: slackDigest,
  subAgents: () => [slackDigest],
});
