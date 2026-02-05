'use client';

import { Blocks, Github, LayoutGrid, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface WorkAppsNavProps {
  tenantId: string;
}

const navItems = [
  {
    label: 'Overview',
    href: (tenantId: string) => `/${tenantId}/work-apps`,
    icon: LayoutGrid,
    exact: true,
  },
  {
    label: 'Slack',
    href: (tenantId: string) => `/${tenantId}/work-apps/slack`,
    icon: MessageSquare,
    exact: false,
  },
  {
    label: 'GitHub',
    href: (tenantId: string) => `/${tenantId}/work-apps/github`,
    icon: Github,
    exact: false,
  },
];

export function WorkAppsNav({ tenantId }: WorkAppsNavProps) {
  const pathname = usePathname();

  return (
    <div className="flex items-center justify-between border-b mb-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-4 border-r mr-2">
          <Blocks className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-medium">Work Apps</h1>
        </div>
        <nav className="flex gap-1">
          {navItems.map((item) => {
            const href = item.href(tenantId);
            const isActive = item.exact ? pathname === href : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
