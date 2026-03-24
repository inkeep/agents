import { dirname, join } from 'node:path';
import {
  SKILL_ENTRY_FILE_PATH,
  type SkillFileApiInsert,
  SkillWithFilesApiSelectSchema,
  serializeSkillToMarkdown,
} from '@inkeep/agents-core';
import { z } from 'zod';
import type { GenerationTask } from '../generation-types';
import { validateGeneratorInput } from '../simple-factory-generator';

const MySchema = SkillWithFilesApiSelectSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

const SkillSchema = z.strictObject({
  ...MySchema.shape,
  metadata: MySchema.shape.metadata.transform((v) => (Object.keys(v ?? {}).length ? v : undefined)),
  files: z.array(
    MySchema.shape.files.element.omit({
      createdAt: true,
      updatedAt: true,
      skillId: true,
      id: true,
    })
  ),
});

type SkillInput = z.input<typeof SkillSchema>;

function parseSkillInput({
  id,
  createdAt,
  updatedAt,
  ...data
}: SkillInput & Record<string, unknown>) {
  return validateGeneratorInput(data, { schema: SkillSchema, errorLabel: 'skill' });
}

export function generateSkillDefinition({
  id,
  createdAt,
  updatedAt,
  ...data
}: SkillInput & Record<string, unknown>): string {
  const { files: _files, ...result } = parseSkillInput({ id, createdAt, updatedAt, ...data });

  return serializeSkillToMarkdown(result);
}

export function generateSkillFiles(
  data: SkillInput & Record<string, unknown>
): SkillFileApiInsert[] {
  const parsed = parseSkillInput(data);

  if (!parsed.files.length) {
    return [
      {
        filePath: SKILL_ENTRY_FILE_PATH,
        content: serializeSkillToMarkdown(parsed),
      },
    ];
  }

  return parsed.files.map((file) => ({
    filePath: file.filePath,
    content: file.content,
  }));
}

export const task: GenerationTask<SkillFileApiInsert> = {
  type: 'skill',
  collect(ctx) {
    return Object.entries(ctx.project.skills ?? {}).flatMap(([skillId, payload]) => {
      const entryPath = join(ctx.paths.skillsDir, skillId, SKILL_ENTRY_FILE_PATH);
      const skillEntryFilePath = ctx.resolver.resolveOutputFilePath('skills', skillId, entryPath);
      const skillDir = dirname(skillEntryFilePath);

      return generateSkillFiles(payload).map((file) => ({
        id: `${skillId}/${file.filePath}`,
        filePath: join(skillDir, file.filePath),
        payload: file,
      }));
    });
  },
  generate(payload) {
    return payload.content;
  },
};
