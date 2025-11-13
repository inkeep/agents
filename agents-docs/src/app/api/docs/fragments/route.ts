import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getMarkdown } from '@/lib/get-markdown';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  try {
    const page = source.getPage(['concepts']);

    if (!page) {
      notFound();
    }

    const markdown = await getMarkdown(page);

    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error processing concepts page:', error);
    return new NextResponse('Internal Server Error', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
