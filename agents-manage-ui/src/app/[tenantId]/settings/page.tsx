import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsContent } from '@/components/settings/settings-content';

function SettingsPage() {
  return (
    <BodyTemplate>
      <MainContent>
        <div className="max-w-4xl mx-auto py-4">
          <PageHeader
            title="Organization Settings"
            description="Manage your organization settings"
          />
          <SettingsContent />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default SettingsPage;
