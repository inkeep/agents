import { SkillApiInsertSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
import { transformToJson } from '@/lib/json-schema-validation';

const SkillMetadata = SkillApiInsertSchema.shape.metadata;

export const SkillSchema = SkillApiInsertSchema.pick({
  name: true,
  description: true,
  content: true,
}).extend({
  metadata: z.string().transform(transformToJson).pipe(SkillMetadata),
});

export type SkillInput = z.input<typeof SkillSchema>;
export type SkillOutput = z.infer<typeof SkillSchema>;
