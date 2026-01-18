'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { FC } from 'react';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { IconComponentProps } from '@/components/ui/svg-icon';

export interface NavItemProps {
  title: string;
  url: string;
  icon?: FC<IconComponentProps>;
  isExternal?: boolean;
}

export function NavItem({ title, url, icon: Icon, isExternal }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(url);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={title} isActive={isActive}>
        <Link
          href={url}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          target={isExternal ? '_blank' : undefined}
        >
          {Icon && <Icon />}
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
