import { loader } from 'fumadocs-core/source';
import { docs } from '@/.source';
import { flattenNav, transformItems } from '@/components/sidebar/transform';
import navigation from '../../navigation';
import { createElement } from 'react';
import * as brandIcons from '@/components/brand-icons';

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  // it assigns a URL to your pages
  baseUrl: '/',
  source: docs.toFumadocsSource(),
  icon(iconName) {
    if (!iconName) return undefined;

    // Handle brand/ prefixed icons
    if (iconName.startsWith('brand/')) {
      const brandIconName = iconName.split('brand/')[1] as keyof typeof brandIcons;
      const BrandIcon = brandIcons[brandIconName];
      if (BrandIcon) {
        return createElement(BrandIcon);
      }
    }

    // Return undefined for other icons to use default behavior
    return undefined;
  },
});

export const docsGroups = navigation.docs.map(transformItems);

export function getDocsGroupFirstChild(url: string | undefined) {
  if (!url) return null;

  const flatList = flattenNav(navigation.docs);
  return flatList.find((page) => page.url.startsWith(`/${url}`));
}

export function getDocsPreviousAndNextPage(url: string) {
  const flatList = flattenNav(navigation.docs);

  const index = flatList.findIndex((page) => page.url === url);

  if (index === -1) {
    // Handle the case where the URL is not found
    return { previous: null, next: null };
  }

  const previous = index > 0 ? flatList[index - 1] : null;
  const next = index < flatList.length - 1 ? flatList[index + 1] : null;

  return { previous, next };
}
