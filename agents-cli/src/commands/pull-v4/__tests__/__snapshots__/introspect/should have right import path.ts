import { project } from '@inkeep/agents-sdk';
import { sample } from './agents/sample';
import { western } from './agents/western';
import { linearTicketFiler } from './agents/linear-ticket-filer';
import { router } from './agents/router';
import { linearTool } from './tools/linear';
import { googleCalendarMcpTool } from './tools/google-calendar-mcp';
import { notionTool } from './tools/notion';
import { googleCalendarMcpTool as googleCalendarMcpTool1 } from './tools/google-calendar-mcp-1';
import { inkeepManageMcpAndrewMikofalvyTool } from './tools/inkeep-manage-mcp-andrew-mikofalvy';
import { testExternalAgent } from './external-agents/test-external-agent';
import { cowboyGreeterUi } from './data-components/cowboy-greeter-ui';
import { linearCredential } from './credentials/linear';
import { linearCredential as linearCredential1 } from './credentials/linear-1';
import { linearCredential as linearCredential2 } from './credentials/linear-2';
import { linearCredential as linearCredential3 } from './credentials/linear-3';
import { linearCredential as linearCredential4 } from './credentials/linear-4';
import { notTheRealSecretCredential } from './credentials/not-the-real-secret';
import { ghSignatureSecretCredential } from './credentials/gh-signature-secret';
import { linearCredential as linearCredential5 } from './credentials/linear-5';
import { notionCredential } from './credentials/notion';

export const andrewTest = project({
  id: 'andrew-test',
  name: 'andrew-test',
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
  agents: () => [sample, western, linearTicketFiler, router],
  tools: () => [linearTool, googleCalendarMcpTool, notionTool, googleCalendarMcpTool1, inkeepManageMcpAndrewMikofalvyTool],
  externalAgents: () => [testExternalAgent],
  dataComponents: () => [cowboyGreeterUi],
  credentialReferences: () => [linearCredential, linearCredential1, linearCredential2, linearCredential3, linearCredential4, notTheRealSecretCredential, ghSignatureSecretCredential, linearCredential5, notionCredential],
});
