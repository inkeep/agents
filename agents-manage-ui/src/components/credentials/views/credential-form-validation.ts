import { z } from 'zod';

export const credentialFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .refine((val) => val.length > 0, 'Name cannot be empty after transformation')
    .refine((val) => val.length <= 50, 'Name must be 50 characters or less'),
  apiKeyToSet: z.string().min(1, 'Enter an API key'),
  metadata: z.record(z.string(), z.string()).default({}),
  selectedTool: z.string().optional(),
});

export type CredentialFormData = z.output<typeof credentialFormSchema>;
