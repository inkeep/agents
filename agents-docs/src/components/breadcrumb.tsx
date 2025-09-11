'use client';
import { useBreadcrumb } from 'fumadocs-core/breadcrumb';
import type { PageTree } from 'fumadocs-core/server';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

export interface BreadcrumbProps {
  tree: PageTree.Root;
}

export function Breadcrumb({ tree }: BreadcrumbProps): React.ReactNode {
  const pathname = usePathname();
  const items = useBreadcrumb(pathname, tree, {
    includePage: false,
  });

  if (items.length === 0) return null;

  return (
    <div className="-mb-3 flex flex-row items-center gap-1 text-xs font-semibold uppercase tracking-widest">
      {items.map((item, i) => (
        <Fragment key={`${item.url}-${i}`}>
          {i !== 0 && (
            <ChevronRight className="size-4 shrink-0 rtl:rotate-180 text-gray-300 dark:text-gray-700" />
          )}
          {item.url ? (
            <Link href={item.url} className="truncate hover:text-fd-accent-foreground">
              {item.name}
            </Link>
          ) : (
            <span className="truncate text-primary dark:text-primary-light">{item.name}</span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
