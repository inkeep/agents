import { BodyTemplate } from '@/components/layout/body-template';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsLoadingSkeleton } from '@/components/settings/loading';

export default function Loading() {
  return (
    <BodyTemplate>
      <PageHeader title="Organization Settings" description="Manage your organization settings" />
      <SettingsLoadingSkeleton />
    </BodyTemplate>
  );
}
