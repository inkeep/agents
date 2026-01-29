'use client';

import { Github } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface WorkAppsNavProps {
  tenantId: string;
}

const navItems = [
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
    <nav className="flex gap-1 border-b mb-6">
      {navItems.map((item) => {
        const href = item.href(tenantId);
        const isActive = item.exact ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-mono uppercase border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
