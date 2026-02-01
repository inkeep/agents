import { AgentApiInsertSchema } from '@inkeep/agents-core/client-exports';
import type { z } from 'zod';

export const AgentSchema = AgentApiInsertSchema.pick({
  name: true,
  id: true,
  description: true,
});

export type AgentInput = z.input<typeof AgentSchema>;
