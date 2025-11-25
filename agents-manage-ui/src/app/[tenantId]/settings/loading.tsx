import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsLoadingSkeleton } from '@/components/settings/loading';

export default function Loading() {
  return (
    <BodyTemplate>
      <MainContent>
        <PageHeader title="Organization Settings" description="Manage your organization settings" />
        <SettingsLoadingSkeleton />
      </MainContent>
    </BodyTemplate>
  );
}
