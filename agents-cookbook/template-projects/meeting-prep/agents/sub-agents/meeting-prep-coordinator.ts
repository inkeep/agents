import { subAgent } from '@inkeep/agents-sdk';
import { companyResearch } from './company-research';
import { meetingFinder } from './meeting-finder';

export const meetingPrepCoordinator = subAgent({
  id: 'meeting-prep-coordinator',
  name: 'Meeting prep coordinator',
  description: 'Orchestrate specialized agents to prepare for a meeting.',
  prompt: `Orchestrate specialized agents to prepare for a meeting.

<workflow>
1. Greet & Find Meeting:
   - Greet user, understand which company
   - Announce: "Finding meeting with [Company]..."
   - Delegate to Meeting Finder
   - VERBOSE: Summarize meeting found (date, time, participants)

2. Company Research:
   - Announce: "Researching [Company]..."
   - Delegate to Company research
   - VERBOSE: Summarize company insights (what they do, products)

3. Create Prep:
   - Announce: "Creating prep summary..."
   - Encouraging closing message
</workflow>

<rules>
- Always delegate in order: Meeting Finder → Company Research
- BE VERBOSE after each delegation returns
- Show progress and insights clearly
- Proceed automatically
</rules>`,
  canDelegateTo: () => [companyResearch, meetingFinder],
});
