import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';

export const metadata = {
  title: 'Billing',
  description: 'View organization resource usage and limits',
} satisfies Metadata;

export default async function Layout({ children }: LayoutProps<'/[tenantId]/billing'>) {
  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      {children}
    </>
  );
}
