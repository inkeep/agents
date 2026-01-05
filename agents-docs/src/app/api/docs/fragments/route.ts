import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getLLMText } from '@/lib/get-llm-text';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  try {
    const page = source.getPage(['concepts']);

    if (!page) {
      notFound();
    }

    let llmText = await getLLMText(page);

    const sectionsToKeep = [
      'Agents',
      'Tools',
      'Sub Agent relationships',
      "Sub Agent 'turn'",
      'Projects',
    ];

    const lines = llmText.split('\n');
    const result: string[] = [];
    let keepCurrentSection = false;

    for (const line of lines) {
      if (
        line.startsWith('# ') ||
        line.startsWith('URL:') ||
        (line.startsWith('Learn about') && result.length === 2)
      ) {
        result.push(line);
        continue;
      }

      if (line.startsWith('## ')) {
        const sectionName = line.substring(3).trim();
        keepCurrentSection = sectionsToKeep.includes(sectionName);

        if (keepCurrentSection) {
          result.push(line);
        }
      } else if (keepCurrentSection) {
        result.push(line);
      }
    }

    llmText = result
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return new NextResponse(llmText, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
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
