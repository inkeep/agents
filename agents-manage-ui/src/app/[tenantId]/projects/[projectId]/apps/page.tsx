import type { Metadata } from 'next';
import { AppsTable } from '@/components/apps/apps-table';
import FullPageError from '@/components/errors/full-page-error';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchApps } from '@/lib/api/apps';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { createLookup } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: STATIC_LABELS.apps,
  description:
    'Apps are external access credentials for your project. Configure web client widgets, API integrations, and more.',
} satisfies Metadata;

async function AppsPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/apps'>) {
  const { tenantId, projectId } = await params;

  try {
    const [apps, agents, permissions] = await Promise.all([
      fetchApps(tenantId, projectId),
      fetchAgents(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);
    const agentLookup = createLookup(agents.data);
    const canUse = permissions.canUse;
    return (
      <>
        <PageHeader title={metadata.title} description={metadata.description} />
        <AppsTable apps={apps.data} agentLookup={agentLookup} canUse={canUse} />
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="Apps" />;
  }
}

export default AppsPage;
