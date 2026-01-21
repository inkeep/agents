import { MCPServerSelection } from '@/components/mcp-servers/selection/mcp-server-selection';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';

async function NewMCPServerPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers/new'>) {
  const { tenantId, projectId } = await params;
  let credentials: Credential[] = [];
  try {
    credentials = await fetchCredentials(tenantId, projectId);
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }

  return <MCPServerSelection credentials={credentials} tenantId={tenantId} projectId={projectId} />;
}

export default NewMCPServerPage;
