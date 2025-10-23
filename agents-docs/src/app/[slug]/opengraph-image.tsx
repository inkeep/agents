import { readFileSync } from 'node:fs';
import { generateOGImage } from './og';
import { source } from '@/lib/source';

const font = readFileSync('./src/app/[...slug]/Inter-Regular.ttf');
const fontSemiBold = readFileSync('./src/app/[...slug]/Inter-SemiBold.ttf');

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

export const contentType = 'image/png';

export default async function Image({ params }: PageProps<'/[[...slug]]'>) {
  const page = source.getPage((await params).slug);
  if (!page) return;
  const subHeading = getSubheading(page.url);
  return generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: subHeading || page.data.sidebarTitle || 'Documentation',
    primaryColor: '#08C9F7',
    primaryTextColor: '#08C9F7',
    // logo: Logo(),
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
