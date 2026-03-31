'use client';

import { useInitialCollapsedSidebar } from '@/hooks/use-initial-collapsed-sidebar';

export default function Layout({
  children,
}: LayoutProps<'/[tenantId]/projects/[projectId]/skills'>) {
  useInitialCollapsedSidebar();
  return children;
}
