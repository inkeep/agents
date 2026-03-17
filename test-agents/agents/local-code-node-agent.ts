import { agent, externalAgent, subAgent } from '@inkeep/agents-sdk';

export const localCodeNode = externalAgent({
  id: 'local-code-node',
  name: 'Local Code Node',
  description: 'Delegates coding tasks into a locally running code-node bridge',
  baseUrl: 'http://127.0.0.1:4318',
});

const localCodeNodeCoordinator = subAgent({
  id: 'local-code-node-coordinator',
  name: 'Local Code Node Coordinator',
  description: 'Routes repository coding tasks to a local code-node bridge during development',
  prompt: `You coordinate coding work during local development.

Use the Local Code Node whenever the user asks for repository changes, debugging, test fixes, refactors, or code review work that should run against the local checkout.

If delegation fails, explain that the developer likely needs to start the local bridge first with inkeep code-node --workspace /absolute/path/to/repo and retry.`,
  canDelegateTo: () => [localCodeNode],
});

export const localCodeNodeAgent = agent({
  id: 'local-code-node-agent',
  name: 'Local Code Node Agent',
  description: 'Reference agent that delegates coding tasks to a locally running code-node bridge',
  defaultSubAgent: localCodeNodeCoordinator,
  subAgents: () => [localCodeNodeCoordinator],
});
