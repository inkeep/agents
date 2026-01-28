import { loader } from 'fumadocs-core/source';
import * as luIcons from 'lucide-react';
import { createElement, type FC } from 'react';
import * as tbIcons from 'react-icons/tb';
import * as brandIcons from '@/components/brand-icons';
import { getApiIcon } from '@/lib/api-icons';
import { docs } from '../../.source/server';

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  // it assigns a URL to your pages
  baseUrl: '/',
  source: docs.toFumadocsSource(),
  icon(iconName) {
    if (!iconName) {
      return;
    }

    let icon: FC | null = null;

    if (iconName.startsWith('api/')) {
      const endpoint = iconName.slice(4);
      icon = getApiIcon(endpoint);
    }
    if (iconName.startsWith('brand/')) {
      icon = brandIcons[iconName.slice(6) as keyof typeof brandIcons];
    } else if (iconName.startsWith('Lu')) {
      // @ts-expect-error fixme
      icon = luIcons[iconName.slice(2) as keyof typeof luIcons];
    } else if (iconName.startsWith('Tb')) {
      icon = tbIcons[iconName as keyof typeof tbIcons];
    }
    if (!icon) {
      throw new Error(`Unknown icon "${iconName}"`);
    }
    return createElement(icon);
  },
});
