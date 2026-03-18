import Link from 'next/link';
import type { FC, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const BreadcrumbNavItem: FC<{
  href: string;
  isLast: boolean;
  label: string;
  /** @default "/"  */
  separator?: '›' | '/' | string;
}> = ({ href, isLast, label, separator = '/' }) => {
  'use memo';

  return (
    <li
      aria-current={isLast ? 'page' : undefined}
      style={{
        // @ts-expect-error
        '--sep': `"${separator}"`,
      }}
      className={cn(
        'shrink-0',
        isLast
          ? 'font-medium text-foreground'
          : 'after:ml-2 after:content-(--sep) after:text-muted-foreground/60'
      )}
    >
      {isLast || !href ? (
        label
      ) : (
        <Link href={href} className="hover:text-foreground">
          {label}
        </Link>
      )}
    </li>
  );
};

const BreadcrumbNav$: FC<{ children: ReactNode; className?: string }> = ({
  children,
  className,
}) => {
  'use memo';
  return (
    <nav aria-label="Breadcrumb">
      <ol
        className={cn(
          'text-sm text-muted-foreground flex items-center gap-2 overflow-y-auto',
          className
        )}
      >
        {children}
      </ol>
    </nav>
  );
};

export const BreadcrumbNav = Object.assign(BreadcrumbNav$, {
  Item: BreadcrumbNavItem,
});
