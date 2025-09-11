'use client';

import { icon } from '@inkeep/docskit';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { File } from '@/components/sidebar/file';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { isActive } from '@/lib/utils';

export interface SidebarPage {
  url: string;
  title: string;
  icon: string;
  sidebarTitle?: string;
  group?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  pages?: SidebarPage[];
}

function isFolderActive(page: SidebarPage, path: string): boolean {
  if (!page.pages) return false;
  return page.pages.some((item) => {
    if ('group' in item) {
      return isFolderActive(item, path);
    }
    return isActive(item.url, path);
  });
}

export const Folder = ({ item, depth = 0 }: { item: SidebarPage; depth?: number }) => {
  const path = usePathname();

  const active = isFolderActive(item, path);
  const groupIcon = icon(item.icon);

  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active && !open) setOpen(active);
    // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  }, [active, open]);

  return (
    <Collapsible className="group/collapsible" open={open} onOpenChange={setOpen}>
      <SidebarMenuItem key={item.group}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            data-depth={depth}
            className="group/folder-button"
            style={
              {
                '--depth': `${depth * 1.5 + 0.5}rem`,
              } as object
            }
          >
            {groupIcon && (
              <span
                className={`text-[16px] ${
                  active
                    ? ''
                    : 'text-gray-400 dark:text-gray-500 group-hover/folder-button:text-gray-500 group-hover/folder-button:dark:text-gray-400'
                }`}
              >
                {groupIcon}
              </span>
            )}
            <span>{item.group}</span>
            <ChevronDown
              className={clsx(
                'dark:group-hover/folder-button:text-gray-400 group-hover/folder-button:text-gray-600',
                'ms-auto transition-transform text-gray-400   dark:text-gray-600 ',
                !open && '-rotate-90'
              )}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.pages?.map((page, i) => {
              if (!page) return;

              if ('group' in page) {
                return <Folder key={i} item={page} depth={depth + 1} />;
              }
              return <File key={i} item={page} depth={depth + 1} />;
            })}
            <SidebarMenuSubItem />
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
};
