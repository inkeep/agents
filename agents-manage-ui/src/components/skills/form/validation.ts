import {
  SkillInsertSchema,
  transformToJson,
  serializeSkillToMarkdown,
  SKILL_ENTRY_FILE_PATH,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const SkillMetadata = SkillInsertSchema.shape.metadata;

export const SkillSchema = z
  .strictObject({
    ...SkillInsertSchema.shape,
    metadata: z
      .string()
      .trim()
      .transform((value, ctx) => (value ? transformToJson(value, ctx) : null))
      .pipe(SkillMetadata)
      .optional()
      .default(null),
  })
  .transform((data) => ({
    files: [
      {
        filePath: SKILL_ENTRY_FILE_PATH,
        content: serializeSkillToMarkdown(data),
      },
    ],
  }));

export type SkillInput = z.input<typeof SkillSchema>;
export type SkillOutput = z.infer<typeof SkillSchema>;
