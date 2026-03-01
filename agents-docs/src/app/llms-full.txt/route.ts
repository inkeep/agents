import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const pages = await Promise.all(
    source.getPages().map(async (page) => {
      const content = await page.data.getText('processed');
      return `# ${page.data.title} (${page.url})\n\n${page.data.description || ''}\n\n${content}`;
    })
  );

  return new Response(pages.join('\n\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
