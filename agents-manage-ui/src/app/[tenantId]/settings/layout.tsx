import { BodyTemplate } from '@/components/layout/body-template';
import { PageHeader } from '@/components/layout/page-header';

export default function Layout({ children }: LayoutProps<'/[tenantId]/projects'>) {
  return (
    <BodyTemplate breadcrumbs={[{ label: 'Settings' }]}>
      <PageHeader title="Organization Settings" description="Manage your organization settings" />
      {children}
    </BodyTemplate>
  );
}
