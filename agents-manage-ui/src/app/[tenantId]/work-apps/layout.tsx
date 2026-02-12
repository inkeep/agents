import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WorkAppsNav } from '@/components/work-apps/work-apps-nav';

export const metadata = {
  title: 'Work Apps',
  description: 'Manage your connected work apps and integrations',
} satisfies Metadata;

export default async function Layout({ children, params }: LayoutProps<'/[tenantId]/work-apps'>) {
  // Gatekeep: only show Work Apps when enabled for this tenant
  if (process.env.NEXT_PUBLIC_ENABLE_WORK_APPS !== 'true') {
    notFound();
  }

  const { tenantId } = await params;

  return (
    <>
      <WorkAppsNav tenantId={tenantId} />
      {children}
    </>
  );
}
