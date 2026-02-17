import { statusComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const toolSummary = statusComponent({
  type: 'tool_summary',
  description: 'Tool summary status component',
  detailsSchema: z.object({ "tool_name": z.string().optional() })
});
