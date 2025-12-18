import { PageHeader } from '@/components/layout/page-header';
import { BodyTemplate } from '@/components/layout/body-template';

export default function Layout({ children }: LayoutProps<'/[tenantId]/projects'>) {
  return (
    <BodyTemplate breadcrumbs={[{ label: 'Settings' }]}>
      <PageHeader title="Organization Settings" description="Manage your organization settings" />
      {children}
    </BodyTemplate>
  );
}
