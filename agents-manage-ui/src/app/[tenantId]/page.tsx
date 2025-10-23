import { redirectToProject } from '../../lib/utils/project-redirect';

async function TenantPage({ params }: PageProps<'/[tenantId]'>) {
  const { tenantId } = await params;
  await redirectToProject(tenantId, 'agents');
}

export default TenantPage;
