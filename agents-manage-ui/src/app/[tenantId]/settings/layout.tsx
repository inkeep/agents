import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsNav } from '@/components/settings/settings-nav';

export const metadata = {
  title: 'Settings',
  description: 'Manage your organization settings and integrations',
} satisfies Metadata;

export default async function Layout({
  children,
  params,
}: LayoutProps<'/[tenantId]/settings'>) {
  const { tenantId } = await params;

  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      <SettingsNav tenantId={tenantId} />
      {children}
    </>
  );
}
