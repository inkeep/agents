'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { FC } from 'react';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { IconComponentProps } from '@/components/ui/svg-icon';

export interface NavItemProps {
  title: string;
  url: string;
  icon: FC<IconComponentProps>;
}

export function NavItem({ title, url, icon: Icon }: NavItemProps) {
  const pathname = usePathname();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={pathname.startsWith(url)}>
        <Link href={url}>
          <Icon />
          {title}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
