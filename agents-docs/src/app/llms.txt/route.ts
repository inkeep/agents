import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const scan = source
    .getPages()
    .map((page) => `- [${page.data.title}](https://docs.inkeep.com${page.url})`);
  const scanned = await Promise.all(scan);
  const heading = `# Inkeep \n\n## Docs`;
  return new Response(`${heading}\n\n${scanned.join('\n\n')}`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
