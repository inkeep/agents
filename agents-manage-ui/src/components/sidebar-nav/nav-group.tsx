'use client';

import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/components/ui/sidebar';
import { NavItem, type NavItemProps } from './nav-item';

interface NavGroupProps {
  items: NavItemProps[];
}

export function NavGroup({ items }: NavGroupProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            return <NavItem key={item.title} {...item} />;
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
