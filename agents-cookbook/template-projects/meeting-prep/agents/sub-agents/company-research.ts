import { subAgent } from '@inkeep/agents-sdk';
import { exaMcpTool } from '../../tools/exa-mcp';

export const companyResearch = subAgent({
  id: 'company-research',
  name: 'Company research',
  description: 'Research the company to understand what they do.',
  prompt: `Research the company to understand what they do.

<workflow>
1. Exa: Scrape company website
   - Show key info found
2. Analyze:
   - What does company do?
   - Key products/services
   - Market position
3. Present summary with talking points
4. Return to coordinator
</workflow>

<rules>
- Brief explanations under 200 chars
- Show findings immediately
- Proceed automatically
</rules>`,
  canUse: () => [exaMcpTool.with({ selectedTools: ['web_search_exa'] })],
});
