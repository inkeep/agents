import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { WorkAppsNav } from '@/components/work-apps/work-apps-nav';

export const metadata = {
  title: 'Work Apps',
  description: 'Manage your connected work apps and integrations',
} satisfies Metadata;

export default async function Layout({ children, params }: LayoutProps<'/[tenantId]/work-apps'>) {
  const { tenantId } = await params;

  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      <WorkAppsNav tenantId={tenantId} />
      {children}
    </>
  );
}
