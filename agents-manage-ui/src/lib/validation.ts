import {
  AgentApiInsertSchema,
  ExternalAgentApiInsertSchema,
  ProjectApiInsertSchema,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

export const AgentSchema = AgentApiInsertSchema.pick({
  name: true,
  id: true,
  description: true,
});

export const ProjectSchema = ProjectApiInsertSchema;

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

export type AgentFormData = z.infer<typeof AgentSchema>;
export type ProjectFormData = z.infer<typeof ProjectSchema>;
export type ExternalAgentFormData = z.infer<typeof ExternalAgentFormSchema>;
