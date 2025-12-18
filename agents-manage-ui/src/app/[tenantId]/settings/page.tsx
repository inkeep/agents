import { BodyTemplate } from '@/components/layout/body-template';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsContent } from '@/components/settings/settings-content';

function SettingsPage() {
  return (
    <BodyTemplate breadcrumbs={[{ label: 'Settings' }]}>
      <PageHeader title="Organization Settings" description="Manage your organization settings" />
      <SettingsContent />
    </BodyTemplate>
  );
}

export default SettingsPage;
