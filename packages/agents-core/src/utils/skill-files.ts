import { simplematter } from 'simplematter';
import { stringify } from 'yaml';
import type { SkillInsert } from '../types';

export const SKILL_ENTRY_FILE_PATH = 'SKILL.md';

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
  // Avoid including metadata in the frontmatter when it's null
  metadata ??= undefined;
  const yaml = stringify({ name, description, metadata });
  const parts = ['---', yaml.trimEnd(), '---', '', content];

  return parts.join('\n');
}
