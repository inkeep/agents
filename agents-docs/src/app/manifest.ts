import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Inkeep Open Source Docs',
    short_name: 'Inkeep Docs',
    description: 'Inkeep docs for building and shipping AI agents.',
    start_url: '/overview',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0b0f17',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/favicon.ico',
        sizes: '16x16 32x32 48x48',
        type: 'image/x-icon',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
