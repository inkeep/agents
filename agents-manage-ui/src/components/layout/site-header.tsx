'use client';

import { useParams } from 'next/navigation';
import { BranchSelector } from '@/components/branches/branch-selector';
import { ThemeToggle } from '@/components/theme-toggle';
import type { BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function SiteHeader({ breadcrumbs }: { breadcrumbs?: BreadcrumbItem[] }) {
  const params = useParams<{ tenantId?: string; projectId?: string }>();
  const isInProject = params?.tenantId && params?.projectId;

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) bg-muted/20 dark:bg-background rounded-t-[14px]">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground hover:bg-accent dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-accent/50" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Breadcrumbs items={breadcrumbs} />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4 ml-auto"
        />
        {isInProject && params.tenantId && params.projectId && (
          <>
            <BranchSelector tenantId={params.tenantId} projectId={params.projectId} />
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          </>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
