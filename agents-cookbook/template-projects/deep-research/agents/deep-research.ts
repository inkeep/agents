import { agent, subAgent } from "@inkeep/agents-sdk";
import { firecrawlMcpTool } from "../tools/firecrawl-mcp";

const deepResearchAssistant = subAgent({
  id: "deep-research-agent",
  name: "Deep research agent",
  description: "A agent that can do deep research on a given topic",
  prompt:
    "When a user asks a question about a given topic, first use webResearchAgent to find at least 3 URL sources. Then, use webScrapingAgent to scrape each of the 3 URLs, calling the webScrapingAgent once for each URL.",
  canDelegateTo: () => [webResearchAgent, webScrapingAgent],
});

const webResearchAgent = subAgent({
  id: "web-research-agent",
  name: "Web research agent",
  description: "A agent that can use firecrawl_search to find URLs",
  prompt:
    "You are a helpful assistant that can use firecrawl_search to find URLs. Use the firecrawl_search tool to find 3 URLs that are relevant to the user's question.",
  canUse: () => [
    firecrawlMcpTool.with({ selectedTools: ["firecrawl_search"] }),
  ],
});

const webScrapingAgent = subAgent({
  id: "web-scraping-agent",
  name: "Web scraping agent",
  description: "A agent that can use firecrawl_scrape to scrape URLs",
  prompt:
    "You are a helpful assistant that can use firecrawl_scrape to scrape URLs",
  canUse: () => [
    firecrawlMcpTool.with({ selectedTools: ["firecrawl_scrape"] }),
  ],
});

export const deepResearchAgent = agent({
  id: "deep-research",
  name: "Deep research",
  description:
    "An intelligent research assistant that discovers, analyzes, and synthesizes information from multiple web sources to provide comprehensive insights on any topic",
  defaultSubAgent: deepResearchAssistant,
  subAgents: () => [deepResearchAssistant, webResearchAgent, webScrapingAgent],
});
