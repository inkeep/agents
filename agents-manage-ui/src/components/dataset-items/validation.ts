import { z } from 'zod';

export const datasetItemSchema = z.object({
  input: z.string().min(1, 'Input is required'),
  expectedOutput: z.string().optional(),
});

export type DatasetItemFormData = z.infer<typeof datasetItemSchema>;
