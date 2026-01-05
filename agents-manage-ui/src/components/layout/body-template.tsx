import { SiteHeader } from '@/components/layout/site-header';
import type { BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { cn } from '@/lib/utils';

type BodyTemplateProps = {
  children: React.ReactNode;
  breadcrumbs: BreadcrumbItem[];
  className?: string;
  disableScroll?: boolean;
};

export function BodyTemplate({
  children,
  breadcrumbs,
  className,
  disableScroll,
}: BodyTemplateProps) {
  return (
    <div className="h-[calc(100vh-16px)] flex flex-col overflow-hidden">
      <SiteHeader breadcrumbs={breadcrumbs} />
      <div
        className={cn(
          'flex flex-col flex-1 scrollbar-thin',
          'scrollbar-thumb-muted-foreground/30 dark:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent h-full w-full min-h-0 bg-muted/20 dark:bg-background',
          disableScroll ? 'overflow-hidden' : 'overflow-y-auto'
        )}
      >
        <div
          id="main-content"
          className={cn(
            '@container',
            'w-full p-6',
            disableScroll ? 'h-full flex flex-col' : 'grow',
            className
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
