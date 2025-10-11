import { redirectToProject } from '../../lib/utils/project-redirect';

async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  await redirectToProject(tenantId, 'agents');
}

export default TenantPage;
