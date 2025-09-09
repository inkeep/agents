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
    if (typeof item === 'string') {
      const page = source.getPage([item]);
      if (!page) return;

      return {
        url: page.url,
        title: page.data.title,
        icon: page.data.icon,
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
