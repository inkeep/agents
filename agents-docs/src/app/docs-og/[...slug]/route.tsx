import { readFileSync } from 'node:fs';
import { metadataImage } from '@/lib/metadata';
import { generateOGImage } from './og';

const font = readFileSync('./src/app/docs-og/[...slug]/Inter-Regular.ttf');
const fontSemiBold = readFileSync('./src/app/docs-og/[...slug]/Inter-SemiBold.ttf');

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

export const GET = metadataImage.createAPI((page) => {
  const subHeading = getSubheading(page.file.path);
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
});

export function generateStaticParams() {
  return metadataImage.generateParams();
}
