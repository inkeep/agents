import { project } from '@inkeep/agents-sdk';
import { blogGeneratorAgent } from './agents/blog-generator-agent';
import { citation } from './artifact-components/citation';
import { scrapedPage } from './artifact-components/scraped-page';
import { strategicOutline } from './artifact-components/strategic-outline';
import { firecrawlMcpTool } from './tools/firecrawl-mcp';

export const blogGenerator = project({
  id: 'blog-generator',
  name: 'Blog Generator',
  models: {
    base: {
      model: 'anthropic/claude-sonnet-4-5',
    },
    structuredOutput: {
      model: 'anthropic/claude-sonnet-4-5',
    },
    summarizer: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  agents: () => [blogGeneratorAgent],
  tools: () => [firecrawlMcpTool],
  artifactComponents: () => [strategicOutline, citation, scrapedPage],
});
