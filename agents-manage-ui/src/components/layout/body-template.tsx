import { SiteHeader } from '@/components/layout/site-header';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/components/ui/breadcrumbs';

type BodyTemplateProps = {
  children: React.ReactNode;
  breadcrumbs: BreadcrumbItem[];
  className?: string;
};

export function BodyTemplate({ children, breadcrumbs, className }: BodyTemplateProps) {
  return (
    <div className="h-[calc(100vh-16px)] flex flex-col overflow-hidden">
      <SiteHeader breadcrumbs={breadcrumbs} />
      <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 dark:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent h-full w-full min-h-0 bg-muted/20 dark:bg-background">
        <div
          id="main-content"
          className={cn('@container/main flex flex-1 flex-col p-6', className)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
