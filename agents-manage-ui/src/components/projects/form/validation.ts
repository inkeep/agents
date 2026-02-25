import { ProjectApiInsertSchema } from '@inkeep/agents-core/client-exports';
import type { z } from 'zod';

export const ProjectSchema = ProjectApiInsertSchema;

export type ProjectInput = z.input<typeof ProjectSchema>;
export type ProjectOutput = z.output<typeof ProjectSchema>;
