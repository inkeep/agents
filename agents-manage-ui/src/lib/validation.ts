import { AgentApiInsertSchema, ProjectApiInsertSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
/**
 * Reusable ID validation schema for database primary keys.
 * Ensures IDs are alphanumeric with underscores and dashes allowed, no whitespace.
 */
export const idSchema = z
  .string()
  .min(1, 'Id is required.')
  .max(64, 'Id must be less than 64 characters.')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Id must contain only alphanumeric characters, underscores, and dashes. No spaces allowed.'
  );

export const AgentSchema = AgentApiInsertSchema.pick({
  name: true,
  id: true,
  description: true,
});

export type AgentFormData = z.infer<typeof AgentSchema>;

export const ProjectSchema = ProjectApiInsertSchema;

export type ProjectFormData = z.infer<typeof ProjectSchema>;
