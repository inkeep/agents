import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { stringify } from 'yaml';
import { z } from 'zod';
import { validateGeneratorInput } from './simple-factory-generator';

const MySchema = FullProjectDefinitionSchema.shape.skills.unwrap().valueType;
const SkillsSchema = z.record(z.string(), MySchema);
const SkillsDirSchema = z.string().nonempty();

type SkillInput = z.input<typeof MySchema>;

type SkillMap = Record<string, SkillInput>;

function formatMetadata(metadata: NonNullable<SkillInput['metadata']>): string {
  const yaml = stringify(metadata);
  const indented = yaml
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `  ${line}`)
    .join('\n');
  return `metadata:\n${indented}`;
}

export async function generateSkills(skills: SkillMap, skillsDir: string): Promise<void> {
  const validatedSkills = validateGeneratorInput(skills, {
    schema: SkillsSchema,
    errorLabel: 'skills',
  });
  const validatedSkillsDir = validateGeneratorInput(skillsDir, {
    schema: SkillsDirSchema,
    errorLabel: 'skills directory',
  });

  await mkdir(validatedSkillsDir, { recursive: true });

  for (const [skillId, skill] of Object.entries(validatedSkills)) {
    const parts: string[] = ['---', `name: ${JSON.stringify(skill.name)}`];
    parts.push(`description: ${JSON.stringify(skill.description ?? '')}`);

    if (skill.metadata && Object.keys(skill.metadata).length > 0) {
      parts.push(formatMetadata(skill.metadata));
    }

    parts.push('---', '', skill.content || '');

    const skillDir = join(validatedSkillsDir, skillId);
    await mkdir(skillDir, { recursive: true });

    const filePath = join(skillDir, 'SKILL.md');
    await writeFile(filePath, parts.join('\n'), 'utf8');
  }
}
