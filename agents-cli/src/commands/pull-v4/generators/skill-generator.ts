import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { stringify } from 'yaml';
import { z } from 'zod';
import type { GenerationTask } from '../generation-types';
import { validateGeneratorInput } from '../simple-factory-generator';

const MySchema = FullProjectDefinitionSchema.shape.skills.unwrap().valueType;

const SkillSchema = z.strictObject({
  ...MySchema.shape,
  metadata: MySchema.shape.metadata.transform((v) => (Object.keys(v ?? {}).length ? v : undefined)),
});

type SkillInput = z.input<typeof SkillSchema>;

export function generateSkillDefinition(data: SkillInput): string {
  const { name, description, metadata, content } = validateGeneratorInput(data, {
    schema: SkillSchema,
    errorLabel: 'skill',
  });
  const yaml = stringify({ name, description, metadata });
  const parts = ['---', yaml.trimEnd(), '---', '', content];

  return parts.join('\n');
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
