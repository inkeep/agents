import { BASE_URL } from '@/lib/constants';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const pages = source.getPages().map((page) => {
    return `- [${page.data.title}](${BASE_URL}${page.url}): ${page.data.description ?? ''}`;
  });

  const body = `# Inkeep

> Inkeep is an open-source multi-agent AI framework with A2A communication capabilities.

## Docs

${pages.join('\n')}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
