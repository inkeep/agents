import { simplematter } from 'simplematter';

export const SKILL_ENTRY_FILE_PATH = 'SKILL.md';

export interface SkillFileInput {
  filePath: string;
  content: string;
}

export function parseSkillMarkdown(markdown: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const [frontmatter, content] = simplematter(markdown);
  return {
    frontmatter: frontmatter as Record<string, unknown>,
    content,
  };
}
