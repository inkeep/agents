import {
  ArtifactComponentApiInsertSchema,
  transformToJson,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const PropsSchema = ArtifactComponentApiInsertSchema.shape.props;

export const ArtifactComponentSchema = ArtifactComponentApiInsertSchema.extend({
  props: z
    .string()
    .trim()
    .refine((v) => v !== 'null', 'Cannot be null')
    .transform((value, ctx) => (value ? transformToJson(value, ctx) : null))
    .pipe(PropsSchema)
    .optional(),
});

export type ArtifactComponentInput = z.input<typeof ArtifactComponentSchema>;
export type ArtifactComponentOutput = z.output<typeof ArtifactComponentSchema>;
