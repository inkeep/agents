import { subAgent } from '@inkeep/agents-sdk';
import { linearTool } from '../../tools/linear';

export const avkkjrdavvv12h0g0dpv622222 = subAgent({
  id: 'avkkjrdavvv12h0g0dpv622222',
  name: '',
  canUse: () => [linearTool.with({ toolPolicies: { get_team: { needsApproval: true }, get_user: { needsApproval: true } } })],
});
