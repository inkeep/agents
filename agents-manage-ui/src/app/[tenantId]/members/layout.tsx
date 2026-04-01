import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';

export const metadata = {
  title: 'Members',
  description: 'Manage organization members and invitations',
} satisfies Metadata;

export default async function Layout({ children }: LayoutProps<'/[tenantId]/members'>) {
  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      {children}
    </>
  );
}
