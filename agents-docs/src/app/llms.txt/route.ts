import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  return new Response(
    [
      '# Inkeep',
      '## Docs',
      ...source
        .getPages()
        .map((page) => `- [${page.data.title}](https://docs.inkeep.com${page.url})`),
    ].join('\n\n')
  );
}
