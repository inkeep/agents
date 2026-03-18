import { simplematter } from 'simplematter';
import { stringify } from 'yaml';
import type { SkillInsert } from '@inkeep/agents-core';

export const SKILL_ENTRY_FILE_PATH = 'SKILL.md';

export interface SkillFileInput {
  filePath: string;
  content: string;
}

export function parseSkillFromMarkdown(markdown: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const [frontmatter, content] = simplematter(markdown);
  return {
    frontmatter: frontmatter as Record<string, unknown>,
    content,
  };
}

export function serializeSkillToMarkdown({ name, description, metadata, content }: SkillInsert) {
  const yaml = stringify({ name, description, metadata });
  const parts = ['---', yaml.trimEnd(), '---', '', content];

  return parts.join('\n');
}
