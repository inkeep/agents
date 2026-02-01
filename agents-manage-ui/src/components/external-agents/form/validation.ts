import { ExternalAgentApiInsertSchema } from '@inkeep/agents-core/client-exports';
import type { z } from 'zod';

export const ExternalAgentFormSchema = ExternalAgentApiInsertSchema.pick({
  name: true,
  description: true,
  baseUrl: true,
  credentialReferenceId: true,
}).extend({
  credentialReferenceId: ExternalAgentApiInsertSchema.shape.credentialReferenceId.transform(
    (value) => (value === 'none' ? null : value)
  ),
});
export type ExternalAgentFormData = z.infer<typeof ExternalAgentFormSchema>;
