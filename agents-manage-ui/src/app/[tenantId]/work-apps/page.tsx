import { WorkAppsOverview } from '@/features/work-apps/common';
import { SlackProvider } from '@/features/work-apps/slack';

async function WorkAppsPage({ params }: PageProps<'/[tenantId]/work-apps'>) {
  const { tenantId } = await params;

  return (
    <SlackProvider tenantId={tenantId}>
      <WorkAppsOverview tenantId={tenantId} />
    </SlackProvider>
  );
}

export default WorkAppsPage;
