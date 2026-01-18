import { z } from 'zod';

export const externalAgentSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  description: z.string().optional(),
  baseUrl: z.string().url('Must be a valid URL.'),
  credentialReferenceId: z.string().nullish(),
});

export type ExternalAgentFormData = z.infer<typeof externalAgentSchema>;
