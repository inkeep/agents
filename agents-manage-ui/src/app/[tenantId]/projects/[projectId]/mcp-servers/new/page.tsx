import { MCPServerSelection } from '@/components/mcp-servers/selection/mcp-server-selection';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/check-permission-or-redirect';

async function NewMCPServerPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers/new'>) {
  const { tenantId, projectId } = await params;

  await checkProjectPermissionOrRedirect(
    tenantId,
    projectId,
    'edit',
    `/${tenantId}/projects/${projectId}/mcp-servers`
  );

  let credentials: Credential[] = [];
  try {
    credentials = await fetchCredentials(tenantId, projectId);
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }

  return <MCPServerSelection credentials={credentials} tenantId={tenantId} projectId={projectId} />;
}

export default NewMCPServerPage;
