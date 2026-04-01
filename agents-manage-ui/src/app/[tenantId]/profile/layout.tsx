import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';

export const metadata = {
  title: STATIC_LABELS.profile,
  description: 'Manage your personal preferences.',
} satisfies Metadata;

export default function Layout({ children }: LayoutProps<'/[tenantId]/profile'>) {
  return (
    <div className="space-y-6">
      <PageHeader title={metadata.title} description={metadata.description} />
      {children}
    </div>
  );
}
