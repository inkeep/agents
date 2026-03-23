import { join } from 'node:path';
import { serializeSkillToMarkdown, SkillWithFilesApiSelectSchema } from '@inkeep/agents-core';
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

export function generateSkillDefinition({
  id,
  createdAt,
  updatedAt,
  ...data
}: SkillInput & Record<string, unknown>): string {
  const result = validateGeneratorInput(data, {
    schema: SkillSchema,
    errorLabel: 'skill',
  });

  return serializeSkillToMarkdown(result);
}

export const task: GenerationTask<Parameters<typeof generateSkillDefinition>[0]> = {
  type: 'skill',
  collect(context) {
    return Object.entries(context.project.skills ?? {}).map(([skillId, payload]) => ({
      id: skillId,
      filePath: context.resolver.resolveOutputFilePath(
        'skills',
        skillId,
        join(context.paths.skillsDir, skillId, 'SKILL.md')
      ),
      payload,
    }));
  },
  generate: generateSkillDefinition,
};
