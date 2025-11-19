import { z } from 'zod';

export const datasetSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

export type DatasetFormData = z.infer<typeof datasetSchema>;
