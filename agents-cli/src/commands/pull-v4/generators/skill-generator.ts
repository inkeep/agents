import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { stringify } from 'yaml';
import type { z } from 'zod';
import type { GenerationTask } from '../generation-types';
import { validateGeneratorInput } from '../simple-factory-generator';

const SkillSchema = FullProjectDefinitionSchema.shape.skills.unwrap().valueType;

type SkillInput = z.input<typeof SkillSchema>;

function formatMetadata(metadata: NonNullable<SkillInput['metadata']>): string {
  const yaml = stringify(metadata);
  const indented = yaml
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `  ${line}`)
    .join('\n');
  return `metadata:\n${indented}`;
}

export function generateSkillDefinition(data: SkillInput): string {
  const parsed = validateGeneratorInput(data, {
    schema: SkillSchema,
    errorLabel: 'skill',
  });

  const parts: string[] = ['---', `name: ${JSON.stringify(parsed.name)}`];
  parts.push(`description: ${JSON.stringify(parsed.description ?? '')}`);

  if (parsed.metadata && Object.keys(parsed.metadata).length > 0) {
    parts.push(formatMetadata(parsed.metadata));
  }

  parts.push('---', '', parsed.content || '');
  return parts.join('\n');
}

export const task = {
  type: 'skill',
  collect(context) {
    return Object.entries(context.project.skills ?? {}).map(([skillId, skill]) => ({
      id: skillId,
      filePath: context.resolver.resolveOutputFilePath(
        'skills',
        skillId,
        join(context.paths.skillsDir, skillId, 'SKILL.md')
      ),
      payload: {
        skillId,
        ...skill,
      } as Parameters<typeof generateSkillDefinition>[0],
    }));
  },
  generate: generateSkillDefinition,
} satisfies GenerationTask<Parameters<typeof generateSkillDefinition>[0]>;
