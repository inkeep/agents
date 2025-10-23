import { readFileSync } from 'node:fs';
import { generateOGImage } from './og';
import { source } from '@/lib/source';

const font = readFileSync('./src/app/og/[...slug]/Inter-Regular.ttf');
const fontSemiBold = readFileSync('./src/app/og/[...slug]/Inter-SemiBold.ttf');

function getSubheading(path: string) {
  const parts = path.split('/');
  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1) {
    return parts[0].replace(/-/g, ' ');
  }
  const secondToLastItem = parts[parts.length - 2];
  return secondToLastItem.replace(/-/g, ' ');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const page = source.getPage(slug);
  
  if (!page) {
    return new Response('Not found', { status: 404 });
  }

  const subHeading = getSubheading(page.url);
  
  return generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: subHeading || page.data.sidebarTitle || 'Documentation',
    primaryColor: '#08C9F7',
    primaryTextColor: '#08C9F7',
    fonts: [
      {
        name: 'Inter',
        data: font,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: fontSemiBold,
        weight: 600,
        style: 'normal',
      },
    ],
  });
}

