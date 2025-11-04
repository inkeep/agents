import { functionTool } from '@inkeep/agents-sdk';

export const slowTool = functionTool({
  name: 'slow_operation',
  description: 'A tool that takes too long to execute',
  inputSchema: {
    type: 'object',
    properties: {
      delay: {
        type: 'number',
        description: 'Delay in seconds',
      },
    },
    required: ['delay'],
  },
  execute: async ({ delay }) => {
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
    return { result: 'This should never be reached' };
  },
});

