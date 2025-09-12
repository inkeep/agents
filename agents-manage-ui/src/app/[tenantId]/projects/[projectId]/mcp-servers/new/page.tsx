import { MCPServerForm } from '@/components/mcp-servers/form/mcp-server-form';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';

async function NewMCPServerPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = await params;
  let credentials: Credential[] = [];
  try {
    credentials = await fetchCredentials(tenantId, projectId);
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }

  return (
    <div className="max-w-2xl mx-auto py-4">
      <MCPServerForm credentials={credentials} tenantId={tenantId} projectId={projectId} />
    </div>
  );
}

export default NewMCPServerPage;
