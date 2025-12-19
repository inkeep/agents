import type { InferPageType } from 'fumadocs-core/source';
import type { source } from '@/lib/source';

function stripMdxComponents(content: string): string {
  let cleaned = content;

  cleaned = cleaned.replace(/^---[\s\S]*?---\n/m, '');

  cleaned = cleaned.replace(/import\s+.*?from\s+['"].*?['"];?\n/g, '');
  cleaned = cleaned.replace(/export\s+.*?\n/g, '');
  cleaned = cleaned.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  cleaned = cleaned.replace(/<[A-Z][a-zA-Z0-9]*(\s[^>]*)?>[\s\S]*?<\/[A-Z][a-zA-Z0-9]*>/gs, '');
  cleaned = cleaned.replace(/<[A-Z][a-zA-Z0-9]*(\s[^>]*)?\/>/g, '');
  cleaned = cleaned.replace(/<\/[A-Z][a-zA-Z0-9]*>/g, '');
  cleaned = cleaned.replace(/<>[\s\S]*?<\/>/gs, '');
  cleaned = cleaned.replace(/<\/>/g, '');

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const rawContent = await page.data.getText('raw');
  const cleanedContent = stripMdxComponents(rawContent);

  return `# ${page.data.title}
URL: ${page.url}

${page.data.description || ''}

${cleanedContent}`;
}
