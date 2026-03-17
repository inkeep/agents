import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { FC, ReactNode } from 'react';

const BreadcrumbNavItem: FC<{
  href: string;
  isLast: boolean;
  label: string;
}> = ({ href, isLast, label }) => {
  return (
    <li
      aria-current={isLast ? 'page' : undefined}
      className={cn(
        'shrink-0',
        isLast
          ? 'font-medium text-foreground'
          : 'after:ml-2 after:content-["›"] after:text-muted-foreground/60'
      )}
    >
      {isLast ? (
        label
      ) : (
        <Link href={href} className="hover:text-foreground">
          {label}
        </Link>
      )}
    </li>
  );
};

const BreadcrumbNav$: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="text-sm text-muted-foreground flex items-center gap-2 overflow-y-auto">
        {children}
      </ol>
    </nav>
  );
};

export const BreadcrumbNav = Object.assign(BreadcrumbNav$, {
  Item: BreadcrumbNavItem,
});
