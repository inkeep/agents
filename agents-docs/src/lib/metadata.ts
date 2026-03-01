import type { Metadata } from 'next';
import { BASE_URL } from '@/lib/constants';

const defaultIcons: Metadata['icons'] = {
  icon: [
    {
      url: '/icon.svg',
      type: 'image/svg+xml',
    },
    {
      url: '/favicon.ico',
      sizes: 'any',
    },
  ],
  shortcut: ['/favicon.ico'],
  apple: [
    {
      url: '/apple-touch-icon.png',
      sizes: '180x180',
    },
  ],
};

export function createMetadata(override: Metadata): Metadata {
  return {
    ...override,
    icons: override.icons ?? defaultIcons,
    manifest: override.manifest ?? '/manifest.webmanifest',
    metadataBase: new URL(BASE_URL),
    openGraph: {
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      url: BASE_URL,
      siteName: 'Inkeep Agents',
      ...override.openGraph,
    },
    twitter: {
      card: 'summary_large_image',
      creator: '@inkeep',
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      ...override.twitter,
    },
  };
}
