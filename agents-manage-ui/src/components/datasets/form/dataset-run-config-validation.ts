import { z } from 'zod';

export const datasetRunConfigSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  agentIds: z.array(z.string()).default([]),
  evaluatorIds: z.array(z.string()).default([]),
});

export type DatasetRunConfigFormData = z.infer<typeof datasetRunConfigSchema>;
