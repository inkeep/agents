import { z } from 'zod';

const dateRangeSchema = z
  .object({
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
  })
  .optional()
  .nullable();

const jobFiltersSchema = z
  .object({
    datasetRunIds: z.array(z.string()).optional(),
    conversationIds: z.array(z.string()).optional(),
    dateRange: dateRangeSchema,
  })
  .optional()
  .nullable();

export const evaluationJobConfigSchema = z.object({
  jobFilters: jobFiltersSchema,
  evaluatorIds: z.array(z.string()).min(1, 'At least one evaluator is required'),
});

export type EvaluationJobConfigFormData = z.infer<typeof evaluationJobConfigSchema>;
