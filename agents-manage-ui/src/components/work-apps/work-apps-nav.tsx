'use client';

import { Blocks, Github, Slack } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface WorkAppsNavProps {
  tenantId: string;
}

const navItems = [
  {
    label: 'All Apps',
    href: (tenantId: string) => `/${tenantId}/work-apps`,
    icon: Blocks,
    exact: true,
  },
  {
    label: 'Slack',
    href: (tenantId: string) => `/${tenantId}/work-apps/slack`,
    icon: Slack,
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
        <nav className="flex h-10 items-end gap-4">
          {navItems.map((item) => {
            const href = item.href(tenantId);
            const isActive = item.exact ? pathname === href : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'inline-flex items-center gap-2 px-3 h-full rounded-none border-0 border-b-2 bg-transparent font-mono text-sm uppercase transition-colors',
                  'mt-0.5 pt-2 pb-1.5',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
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
