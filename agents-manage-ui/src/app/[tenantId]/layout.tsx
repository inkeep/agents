import { AppSidebarProvider } from '@/components/sidebar-nav/app-sidebar-provider';
import { SidebarInset } from '@/components/ui/sidebar';

export default function Layout({ children }: LayoutProps<'/[tenantId]'>) {
  return (
    <AppSidebarProvider>
      <SidebarInset>{children}</SidebarInset>
    </AppSidebarProvider>
  );
}
