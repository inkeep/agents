import { z } from 'zod';

export const evaluationRunConfigRelationSchema = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
});

export const datasetRunConfigSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  agentIds: z.array(z.string()).default([]),
  evaluationRunConfigIds: z.array(z.string()).default([]),
  evaluationRunConfigs: z.array(evaluationRunConfigRelationSchema).default([]),
  triggerEvaluations: z.boolean().optional().default(false),
});

export type DatasetRunConfigFormData = z.infer<typeof datasetRunConfigSchema>;

