import { project } from '@inkeep/agents-sdk';
import { customerResearcherAgent } from './agents/customer-researcher-agent';
import { inkeepFactsAgent } from './agents/inkeep-facts-agent';
import { personResearcherAgent } from './agents/person-researcher-agent';
import { citation } from './artifact-components/citation';
import { apolloMcp } from './tools/apollo-mcp';
import { crustdataMcp } from './tools/crustdata-mcp';
import { exaMcp } from './tools/exa-mcp';
import { firecrawlMcp } from './tools/firecrawl-mcp';
import { googleCalendarMcp } from './tools/google-calendar-mcp';
import { hubspotMcp } from './tools/hubspot-mcp';
import { inkeepAgentsMcp } from './tools/inkeep-agents-mcp';
import { slackMcp } from './tools/slack-mcp';
import { zendeskMcp } from './tools/zendesk-mcp';
import { inkeepAgent } from './agents/enhanced-maestro-agent';
import { inkeepFactsTool } from './tools/inkeep-facts';

export const customerOperationsProject = project({
  id: 'customer-operations-project',
  name: 'Customer Operations',
  models: {
    base: {
      model: 'anthropic/claude-sonnet-4-5'
    },
    summarizer: {
      model: 'anthropic/claude-sonnet-4-5'
    },
    structuredOutput: {
      model: 'anthropic/claude-sonnet-4-5'
    }
  },
  agents: () => [
    inkeepFactsAgent,
    personResearcherAgent,
    customerResearcherAgent,
    inkeepAgent
  ],
  tools: () => [
    googleCalendarMcp,
    exaMcp,
    hubspotMcp,
    zendeskMcp,
    crustdataMcp,
    slackMcp,
    apolloMcp,
    firecrawlMcp,
    inkeepAgentsMcp,
    inkeepFactsTool
  ],
  artifactComponents: () => [
    citation
  ]
});