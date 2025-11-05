'use client';

import { icon } from '@inkeep/docskit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { OpenApiTag } from '@/components/openapi-tag';
import type { SidebarPage } from '@/components/sidebar/folder';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { isActive } from '@/lib/utils';
import * as brandIcons from '@/components/brand-icons';
import React from 'react';

export const File = ({ depth = 0, item }: { item: SidebarPage; depth?: number }) => {
  const { url, icon: iconName, title, sidebarTitle } = item;
  const path = usePathname();
  const active = isActive(url, path, false);
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        data-depth={depth}
        className={`${active ? 'font-semibold' : ''} group/menu-button`}
        style={{
          '--depth': `${depth + 0.5}rem`,
        }}
      >
        <Link href={url} onClick={() => setOpenMobile(false)}>
          <span
            className={`text-[16px] ${
              active
                ? ''
                : 'text-gray-400 dark:text-gray-500 group-hover/menu-button:text-gray-500 group-hover/menu-button:dark:text-gray-400'
            }`}
          >
            {' '}
            {iconName?.startsWith('brand/')
              ? React.createElement(
                  brandIcons[iconName.split('brand/')[1] as keyof typeof brandIcons]
                )
              : icon(iconName)}
          </span>
          <span>{sidebarTitle ?? title}</span>
          {item.method && (
            <OpenApiTag variant={item.method} className="ml-auto">
              {item.method}
            </OpenApiTag>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
