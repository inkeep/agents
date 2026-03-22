import {
  SKILL_ENTRY_FILE_PATH,
  SkillFileContentInputSchema,
  SkillInsertSchema,
  serializeSkillToMarkdown,
  transformToJson,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const SkillMetadataSchema = SkillInsertSchema.shape.metadata;

export const BaseSkillSchema = z.strictObject({
  ...SkillInsertSchema.shape,
  metadata: z
    .string()
    .trim()
    .transform((value, ctx) => (value ? transformToJson(value, ctx) : null))
    .pipe(SkillMetadataSchema)
    .default(null),
});

export const SkillSchema = BaseSkillSchema.transform((data) => ({
  files: [
    {
      filePath: SKILL_ENTRY_FILE_PATH,
      content: serializeSkillToMarkdown(data),
    },
  ],
}));

export const SkillFileSchema = SkillFileContentInputSchema;

type SkillFileInput = z.input<typeof SkillFileSchema>;

export type SkillInput = z.input<typeof SkillSchema>;
export type SkillOutput = z.infer<typeof SkillSchema>;
