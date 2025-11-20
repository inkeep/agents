import { agent, subAgent } from '@inkeep/agents-sdk';
import { crustdataMcp } from '../tools/crustdata-mcp';
import { firecrawlMcp } from '../tools/firecrawl-mcp';

const customerResearcher = subAgent({
  id: `customer-researcher`,
  name: `Customer Researcher`,
  description: `Researches a customer organization to understand what they do and general background information.`,
  prompt: `You are the Customer Researcher agent. Your job is to understand the customer organization deeply.

**Your Workflow:**

1) **Scrape Website:**
   - Say: "Scraping [domain] with Firecrawl..."
   - Use Firecrawl on the customer website
   - Show: What the organization does, key info found

2) **Enrich Data:**
   - Say: "Getting customer data with Crustdata..."
   - Use Crustdata's company domain tool
   - Show: Products, market position, background

3) **Analyze:**
   - What does this organization do?
   - Key products/services?
   - Market position and focus?
   - Recent news or developments?

4) **Present Summary:**
   - Brief organization overview
   - Relevant info for customer-operations workflows
   - Key talking points

5) **Return:**
   - After presenting summary, return control to the calling agent or workflow

**CRITICAL RULES:**
- Use Crustdata for COMPANY domain (not people)
- Keep explanations brief (aim for under 200 chars per bullet)
- After each tool: show key findings immediately
- After analysis, return to caller
- Proceed automatically - no permission requests

**Goal:** Understand what the customer organization does and gather general background information relevant to customer operations.`,
  canUse: () => [
    crustdataMcp,
    firecrawlMcp
  ],
  canTransferTo: () => [],
  canDelegateTo: () => []
});

export const customerResearcherAgent = agent({
  id: `customer-researcher-agent`,
  name: `Customer Researcher Agent`,
  description: `Standalone customer research agent for Customer Operations workflows.`,
  defaultSubAgent: customerResearcher,
  subAgents: () => [customerResearcher]
});