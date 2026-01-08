import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';

type SkillMap = Record<
  string,
  {
    name: string;
    description?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
    license?: string | null;
    compatibility?: string | null;
    allowedTools?: string[] | null;
    scripts?: string[] | null;
    references?: string[] | null;
    assets?: string[] | null;
  }
>;

function formatMetadata(metadata: Record<string, unknown>): string {
  const yaml = stringify(metadata);
  const indented = yaml
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `  ${line}`)
    .join('\n');
  return `metadata:\n${indented}`;
}

export async function generateSkills(skills: SkillMap, skillsDir: string): Promise<void> {
  await mkdir(skillsDir, { recursive: true });

  for (const [skillId, skill] of Object.entries(skills)) {
    const parts: string[] = ['---', `name: ${JSON.stringify(skill.name)}`];
    parts.push(`description: ${JSON.stringify(skill.description ?? '')}`);

    if (skill.license) {
      parts.push(`license: ${JSON.stringify(skill.license)}`);
    }

    if (skill.compatibility) {
      parts.push(`compatibility: ${JSON.stringify(skill.compatibility)}`);
    }

    if (skill.allowedTools && skill.allowedTools.length > 0) {
      parts.push(`allowedTools: ${JSON.stringify(skill.allowedTools)}`);
    }

    if (skill.scripts && skill.scripts.length > 0) {
      parts.push(`scripts: ${JSON.stringify(skill.scripts)}`);
    }

    if (skill.references && skill.references.length > 0) {
      parts.push(`references: ${JSON.stringify(skill.references)}`);
    }

    if (skill.assets && skill.assets.length > 0) {
      parts.push(`assets: ${JSON.stringify(skill.assets)}`);
    }

    if (skill.metadata && Object.keys(skill.metadata).length > 0) {
      parts.push(formatMetadata(skill.metadata));
    }

    parts.push('---', '', skill.content || '');

    const filePath = join(skillsDir, `${skillId}.md`);
    await writeFile(filePath, parts.join('\n'), 'utf8');
  }
}
