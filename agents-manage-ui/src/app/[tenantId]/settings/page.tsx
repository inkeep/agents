import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsContent } from '@/components/settings/settings-content';

function SettingsPage() {
  return (
    <BodyTemplate>
      <MainContent>
        <PageHeader
          title="Organization Settings"
          description="Manage your organization settings"
        />
        <SettingsContent />
      </MainContent>
    </BodyTemplate>
  );
}

export default SettingsPage;

