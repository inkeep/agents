import { project } from '@inkeep/agents-sdk';
import { meetingAssistant } from './agents/meeting-assistant';
import { exaMcpTool } from './tools/exa-mcp';
import { googleCalendarMcpTool } from './tools/google-calendar-mcp';

export const meetingPrep = project({
  id: 'meeting-prep',
  name: 'Meeting prep',
  description: 'Meeting prep project template',
  agents: () => [meetingAssistant],
  tools: () => [exaMcpTool, googleCalendarMcpTool],
  models: {
    base: { model: 'openai/gpt-4o-mini' },
  },
});
