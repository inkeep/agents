import { ArtifactComponentApiInsertSchema, toJson } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const PropsSchema = ArtifactComponentApiInsertSchema.shape.props;

export const ArtifactComponentSchema = ArtifactComponentApiInsertSchema.extend({
  props: z
    .string()
    .trim()
    .transform((value, ctx) => (value ? toJson(value, ctx) : null))
    .pipe(PropsSchema)
    .optional(),
});

export type ArtifactComponentFormData = z.input<typeof ArtifactComponentSchema>;
// export type ArtifactComponentInput = z.input<typeof ArtifactComponentSchema>;
export type ArtifactComponentOutput = z.output<typeof ArtifactComponentSchema>;
