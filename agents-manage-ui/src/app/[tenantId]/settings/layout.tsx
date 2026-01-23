import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';

export const metadata = {
  title: 'Organization Settings',
  description: 'Manage your organization settings',
} satisfies Metadata;

export default async function Layout({ children }: LayoutProps<'/[tenantId]/settings'>) {
  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      {children}
    </>
  );
}
