'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId?: string }>();
  const allItems = useMemo(() => {
    const result: BreadcrumbItem[] = [
      {
        label: 'Projects',
        href: `/${tenantId}/projects`,
      },
    ];
    if (projectId) {
      result.push({
        label: projectId,
        href: `/${tenantId}/projects/${projectId}`,
      });
    }
    if (items) {
      result.push(...items);
    }
    return result;
  }, [items, tenantId, projectId]);

  return (
    <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2">
        {allItems.map((item, idx, arr) => {
          const isLast = idx === arr.length - 1;
          return (
            <li
              key={`${item.label}-${idx}`}
              className={cn(
                'flex items-center gap-2',
                !isLast && 'after:content-["›"] after:text-muted-foreground/60'
              )}
            >
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span className={cn(isLast && 'font-medium text-foreground')}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
