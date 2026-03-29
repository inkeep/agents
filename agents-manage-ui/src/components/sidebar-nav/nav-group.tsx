'use client';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import { NavItem, type NavItemProps } from './nav-item';

export interface NavGroupProps {
  items: Omit<NavItemProps, 'currentPath'>[];
  label?: string;
  currentPath: string;
}

export function NavGroup({ items, label, currentPath }: NavGroupProps) {
  return (
    <SidebarGroup className="px-2 py-1">
      {label ? (
        <SidebarGroupLabel className="relative group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100! font-mono uppercase">
          <span className="transition-opacity duration-200 ease-linear group-data-[state=collapsed]:opacity-0">
            {label}
          </span>
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/20 opacity-0 transition-opacity duration-200 ease-linear group-data-[state=collapsed]:opacity-100" />
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => (
            <NavItem key={item.title} currentPath={currentPath} {...item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
