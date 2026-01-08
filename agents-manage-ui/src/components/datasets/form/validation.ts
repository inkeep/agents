import { z } from 'zod';

export const datasetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export type DatasetFormData = z.infer<typeof datasetSchema>;
