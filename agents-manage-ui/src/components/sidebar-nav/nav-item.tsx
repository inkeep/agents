'use client';

import Link from 'next/link';
import type { FC } from 'react';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { IconComponentProps } from '@/components/ui/svg-icon';

export interface NavItemProps {
  title: string;
  url: string;
  icon: FC<IconComponentProps>;
  currentPath: string;
}

export function NavItem({ title, url, icon: Icon, currentPath }: NavItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={currentPath.startsWith(url)}>
        <Link href={url}>
          <Icon />
          {/* Keep this span to prevent layout issues with long titles when sidebar collapsing */}
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
