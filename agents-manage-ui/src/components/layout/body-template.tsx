import { SiteHeader } from '@/components/layout/site-header';

type BodyTemplateProps = {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
};

export function BodyTemplate({ children, breadcrumbs }: BodyTemplateProps) {
  return (
    <div className="h-[calc(100vh-16px)] flex flex-col overflow-hidden">
      <SiteHeader breadcrumbs={breadcrumbs} />
      <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 dark:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent h-full w-full min-h-0 bg-muted/20 dark:bg-background">
        <div id="main-content" className="@container/main min-h-0 flex flex-1 flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
