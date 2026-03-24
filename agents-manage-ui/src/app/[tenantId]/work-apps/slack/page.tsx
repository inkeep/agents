import { SlackDashboard, SlackProvider } from '@/features/work-apps/slack';

async function SlackWorkAppPage({ params }: PageProps<'/[tenantId]/work-apps/slack'>) {
  const { tenantId } = await params;

  return (
    <SlackProvider tenantId={tenantId}>
      <SlackDashboard />
    </SlackProvider>
  );
}

export default SlackWorkAppPage;
