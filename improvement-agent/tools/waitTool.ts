import { functionTool } from '@inkeep/agents-sdk';

export const waitTool = functionTool({
  name: 'wait_for_results',
  description:
    'Waits 25 seconds for async operations (dataset runs, evaluation runs) to complete. Call this repeatedly while polling for results that are not yet ready.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Brief description of what you are waiting for (e.g., "dataset run to complete")',
      },
    },
    required: ['reason'],
  },
  execute: async ({ reason }: { reason: string }) => {
    await new Promise((resolve) => setTimeout(resolve, 25 * 1000));
    return { waited: '25s', reason, message: 'Wait complete. Check results now.' };
  },
});
