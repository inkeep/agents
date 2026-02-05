import type { Metadata } from 'next';
import { WorkAppsNav } from '@/components/work-apps/work-apps-nav';

export const metadata = {
  title: 'Work Apps',
  description: 'Manage your connected work apps and integrations',
} satisfies Metadata;

export default async function Layout({ children, params }: LayoutProps<'/[tenantId]/work-apps'>) {
  const { tenantId } = await params;

  return (
    <>
      <WorkAppsNav tenantId={tenantId} />
      {children}
    </>
  );
}
