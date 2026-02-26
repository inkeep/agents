import { readFileSync } from 'node:fs';
import type { NextRequest } from 'next/server';
import { source } from '@/lib/source';
import { Logo } from './logo';
import { generateOGImage } from './og';

const font = readFileSync(
  './src/app/api/docs-og/[...slug]/Neue_Haas_Grotesk_Display_Pro_45_Light.otf'
);
const fontMono = readFileSync('./src/app/api/docs-og/[...slug]/JetBrainsMono-Medium.ttf');
const backgroundImage = readFileSync('./src/app/api/docs-og/[...slug]/og-background.png');
const backgroundImageDataUrl = `data:image/png;base64,${backgroundImage.toString('base64')}`;
const OG_CACHE_CONTROL = 'public, max-age=0, s-maxage=2592000, stale-while-revalidate=86400';

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

export const GET = async (_req: NextRequest, ctx: RouteContext<'/api/docs-og/[...slug]'>) => {
  const { slug } = await ctx.params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) return;
  const subHeading = getSubheading(page.url);
  const image = generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: subHeading || page.data.sidebarTitle || 'Documentation',
    primaryTextColor: '#ffffff',
    backgroundImageUrl: backgroundImageDataUrl,
    logo: Logo(),
    fonts: [
      {
        name: 'Neue Haas Grotesk Display Pro 45 Light',
        data: font,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'JetBrains Mono',
        data: fontMono,
        weight: 500,
        style: 'normal',
      },
    ],
  });
  image.headers.set('Cache-Control', OG_CACHE_CONTROL);
  return image;
};
