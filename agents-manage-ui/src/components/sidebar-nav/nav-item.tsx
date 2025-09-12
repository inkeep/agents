'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

export interface NavItemProps {
  title: string;
  url: string;
  icon?: LucideIcon;
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
