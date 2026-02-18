import type { FC } from 'react';
import { HeaderMenus } from '@/components/layout/header-menus';
import { SentryScopeProvider } from '@/components/sentry-scope-provider';
import { AppSidebarProvider } from '@/components/sidebar-nav/app-sidebar-provider';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const Layout: FC<LayoutProps<'/[tenantId]'>> = ({ children, breadcrumbs }) => {
  return (
    <AppSidebarProvider>
      <SentryScopeProvider>
        <SidebarInset>
          <div className="h-[calc(100vh-16px)] flex flex-col overflow-hidden">
            <header className="h-(--header-height) shrink-0 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) bg-muted/20 dark:bg-background rounded-t-[14px] flex items-center gap-1 px-4 lg:gap-2 lg:px-6">
              <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground hover:bg-accent dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-accent/50" />
              <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
              <nav aria-label="Breadcrumb">
                <ol className="text-sm text-muted-foreground flex items-center gap-2 overflow-y-auto">
                  {breadcrumbs}
                </ol>
              </nav>
              <HeaderMenus />
            </header>
            <main
              id="main-content"
              className={cn(
                'flex flex-col flex-1 @container',
                'overflow-y-auto',
                'scrollbar-thin scrollbar-track-transparent',
                'scrollbar-thumb-muted-foreground/30 dark:scrollbar-thumb-muted-foreground/50',
                'bg-muted/20 dark:bg-background'
              )}
            >
              <div className="flex-1 p-6 [&:has(>.no-parent-container)]:contents">{children}</div>
            </main>
          </div>
        </SidebarInset>
      </SentryScopeProvider>
    </AppSidebarProvider>
  );
};

export default Layout;
