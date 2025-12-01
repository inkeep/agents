import type { SidebarPage } from '@/components/sidebar/folder';
import { source } from '@/lib/source';

export const transformItems = (group: any) => {
  if (!group.pages) return;
  const grp = {
    group: group.group,
    icon: group.icon,
    pages: [] as any[],
  } as SidebarPage;
  grp.pages = group.pages.map((item: any) => {
    const slug = typeof item === 'string' ? item : item.page;
    if (slug) {
      const page = source.getPage([slug]);
      if (!page) return null;

      return {
        url: page.url,
        title: page.data.title,
        icon: item.icon ?? page.data.icon,
        sidebarTitle: page.data.sidebarTitle,
        method: page.data._openapi?.method,
      };
    }

    return transformItems(item);
  });

  return grp;
};

export function flattenNav(navItems: any[]): any[] {
  const flatList: any[] = [];

  function traverse(items: any[]) {
    for (const item of items) {
      if (typeof item === 'string') {
        const page = source.getPage([item]);
        if (page) {
          flatList.push({
            url: page.url,
            title: page.data.title,
            // Add other properties if needed
          });
        }
      } else if (item.pages) {
        traverse(item.pages);
      }
    }
  }

  traverse(navItems);
  return flatList;
}
