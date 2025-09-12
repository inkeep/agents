import type { ComponentProps, ReactNode } from 'react';
import type { BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { cn } from '@/lib/utils';

// Root component that provides the base layout
export function PageHeaderRoot({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-row gap-0 p-0 flex-nowrap items-center justify-between mb-8',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Content section with title and description
export function PageHeaderContent({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-2 p-0 flex-nowrap items-stretch justify-start', className)}
      {...props}
    >
      {children}
    </div>
  );
}

// Title component
export function PageHeaderTitle({ className, children, ...props }: ComponentProps<'h3'>) {
  return (
    <h3 className={cn('text-xl font-light', className)} {...props}>
      {children}
    </h3>
  );
}

// Description component
export function PageHeaderDescription({ className, children, ...props }: ComponentProps<'p'>) {
  return (
    <p className={cn('text-muted-foreground text-sm font-normal', className)} {...props}>
      {children}
    </p>
  );
}

// Backwards compatibility wrapper
interface PageHeaderProps {
  title: string;
  description?: string | ReactNode;
  action?: ReactNode;
  className?: string;
  breadcrumbs?: BreadcrumbItem[];
}

export function PageHeader({
  title,
  description,
  action,
  className,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <PageHeaderRoot className={className}>
      <PageHeaderContent>
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
        <PageHeaderTitle>{title}</PageHeaderTitle>
        {description && <PageHeaderDescription>{description}</PageHeaderDescription>}
      </PageHeaderContent>
      {action}
    </PageHeaderRoot>
  );
}
